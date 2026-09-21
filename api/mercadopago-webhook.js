// api/mercadopago-webhook.js
// Este arquivo TAMBÉM é seu back-end: é pra cá que o Mercado Pago manda um aviso
// automático toda vez que uma "order" muda de status. Ele não é chamado pelo seu
// site — é chamado pelo servidor do Mercado Pago diretamente.
//
// Confere se o pagamento foi confirmado e, se sim, marca o usuário como assinante
// ativo no Supabase por 30 dias (já que o Pix avulso não renova sozinho).
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel):
//   MP_ACCESS_TOKEN            -> o mesmo Access Token usado em mercadopago-criar-pix.js
//   MP_WEBHOOK_SECRET          -> a chave secreta gerada ao salvar a configuração do
//                                 webhook (Suas integrações > Webhooks > Configurar notificações)
//   SUPABASE_URL                -> a mesma URL usada no index.html
//   SUPABASE_SERVICE_ROLE_KEY   -> a "service role key" do Supabase (NUNCA a anon key)
//
// No painel do Mercado Pago: Suas integrações > [sua aplicação] > Webhooks > Configurar notificações
//   URL: https://SEU-DOMINIO.vercel.app/api/mercadopago-webhook
//   Evento: Order (Mercado Pago)

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

// Mesmo preço definido em api/mercadopago-criar-pix.js. Antes de liberar
// qualquer acesso, confirmamos que o valor realmente pago bate com o preço
// do plano — sem isso, um pagamento de qualquer valor (até R$0,01) liberaria
// 30 dias de acesso.
const PRECO_PLANO_BRL = 19.90;
const TOLERANCIA_BRL = 0.01; // evita falso-negativo por arredondamento de centavos

function assinaturaValida(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (!secret || !xSignature) return !secret; // se ainda não configurou o secret, não bloqueia (só avisa no log)

  const partes = Object.fromEntries(
    xSignature.split(',').map(p => p.trim().split('=')).filter(p => p.length === 2)
  );
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${partes.ts};`;
  const hashEsperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return hashEsperado === partes.v1;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    // O Mercado Pago também chama com GET pra testar o endpoint; respondemos OK.
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const orderId = req.body?.data?.id || req.query?.['data.id'];
    const tipo = req.body?.type || req.query?.type;

    if (!orderId || (tipo && tipo !== 'order')) {
      res.status(200).json({ ok: true, ignorado: true });
      return;
    }

    if (!assinaturaValida(req, orderId)) {
      console.warn('Assinatura do webhook do Mercado Pago inválida, ignorando notificação.');
      res.status(200).json({ ok: true, ignorado: true });
      return;
    }

    // Busca os detalhes reais da order na API do Mercado Pago
    // (nunca confie apenas no que vem na notificação).
    const resposta = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const order = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro ao consultar order no Mercado Pago:', order);
      res.status(200).json({ ok: true, erro: true });
      return;
    }

    // "processed" + status_detail "accredited" = Pix confirmado e creditado
    if (order.status === 'processed') {
      const userId = order.external_reference;
      if (!userId) {
        console.warn('Order processada sem external_reference, ignorando.');
        res.status(200).json({ ok: true });
        return;
      }

      // Confere se o valor efetivamente pago corresponde ao preço do plano.
      // A API de "orders" do Mercado Pago retorna o valor em transactions;
      // aceitamos tanto esse formato quanto o campo legado transaction_amount.
      const valorPago = Number(
        order?.transactions?.payments?.[0]?.amount ??
        order?.transaction_amount ??
        0
      );

      if (!valorPago || Math.abs(valorPago - PRECO_PLANO_BRL) > TOLERANCIA_BRL) {
        console.warn(`Valor pago (${valorPago}) não corresponde ao preço do plano (${PRECO_PLANO_BRL}) para order ${orderId}. Acesso NÃO liberado.`);
        res.status(200).json({ ok: true, ignorado: true, motivo: 'valor_incorreto' });
        return;
      }

      await supabase.from('assinaturas').upsert({
        user_id: userId,
        status: 'ativo',
        expira_em: new Date(Date.now() + TRINTA_DIAS_MS).toISOString(),
        atualizado_em: new Date().toISOString()
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao processar webhook do Mercado Pago:', err);
    // Devolvemos 200 mesmo em erro interno pra evitar retentativas em loop
    // (o erro já fica registrado no log da Vercel pra você investigar).
    res.status(200).json({ ok: false });
  }
};
