// api/mercadopago-webhook.js
// Este arquivo TAMBÉM é seu back-end: é pra cá que o Mercado Pago manda um aviso
// automático toda vez que um PAGAMENTO muda de status. Ele não é chamado pelo seu
// site — é chamado pelo servidor do Mercado Pago diretamente.
//
// Importante: o seu api/mercadopago-criar-pix.js usa a API antiga de pagamentos
// (/v1/payments), então este webhook escuta notificações do tipo "payment"
// (não "order"). Se um dia vocês trocarem o criar-pix.js pra API de orders,
// este arquivo também precisa mudar junto.
//
// Confere se o pagamento foi aprovado e, se sim, marca o usuário como assinante
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
//   Evento: Pagamentos (payments)

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

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
    const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;
    const tipo = req.body?.type || req.query?.type;

    if (!paymentId || (tipo && tipo !== 'payment')) {
      res.status(200).json({ ok: true, ignorado: true });
      return;
    }

    if (!assinaturaValida(req, paymentId)) {
      console.warn('Assinatura do webhook do Mercado Pago inválida, ignorando notificação.');
      res.status(200).json({ ok: true, ignorado: true });
      return;
    }

    // Busca os detalhes reais do pagamento na API do Mercado Pago
    // (nunca confie apenas no que vem na notificação).
    const resposta = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const pagamento = await resposta.json();

    if (!resposta.ok) {
      console.error('Erro ao consultar pagamento no Mercado Pago:', pagamento);
      res.status(200).json({ ok: true, erro: true });
      return;
    }

    if (pagamento.status === 'approved') {
      const userId = pagamento.external_reference;
      if (!userId) {
        console.warn('Pagamento aprovado sem external_reference, ignorando.');
        res.status(200).json({ ok: true });
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
