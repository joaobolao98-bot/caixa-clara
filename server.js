// ATENÇÃO: este arquivo é um servidor Express separado, para rodar localmente
// ou em outro host que não a Vercel (ex.: `node server.js`). Na Vercel, quem
// realmente atende as requisições é o conteúdo da pasta /api. Se você só usa
// a Vercel, pode remover este arquivo com segurança para evitar duplicidade.
//
// Antes deste arquivo tinha um Access Token de produção do Mercado Pago
// escrito diretamente no código-fonte. Isso foi removido: agora o token vem
// SEMPRE de uma variável de ambiente e nunca fica salvo no repositório.

import express from 'express';
import cors from 'cors';

const app = express();

// Preço do plano definido apenas aqui, no servidor — nunca aceite um valor
// de "amount" vindo do navegador, ou qualquer pessoa poderia pagar um valor
// menor do que o combinado.
const PRECO_PLANO_BRL = 19.90;

// Restrinja o CORS ao domínio real do seu site em produção.
const origemPermitida = process.env.SITE_URL || 'https://caixa-clara-five.vercel.app';
app.use(cors({ origin: origemPermitida }));
app.use(express.json());
app.use(express.static('public')); // Se o seu index.html estiver numa pasta chamada 'public'

app.post('/api/mercadopago-criar-pix', async (req, res) => {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('MP_ACCESS_TOKEN não configurado nas variáveis de ambiente.');
    return res.status(500).json({ erro: 'Configuração do servidor incompleta.' });
  }

  try {
    const { email, external_reference } = req.body;

    const dadosPagamento = {
      transaction_amount: PRECO_PLANO_BRL,
      description: 'Assinatura Caixa Clara - Plano Profissional',
      payment_method_id: 'pix',
      payer: {
        email: email || 'cliente@dominio.com'
      },
      external_reference: external_reference || `pedido_${Date.now()}`
    };

    const respostaMP = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(dadosPagamento)
    });

    const respostaJson = await respostaMP.json();

    if (!respostaMP.ok) {
      console.error('Erro retornado pelo Mercado Pago:', respostaJson);
      return res.status(500).json({ erro: 'Erro ao gerar pagamento no Mercado Pago' });
    }

    // Extrai o QR Code em Base64 e o código Copia e Cola da resposta do Mercado Pago
    const pointOfInteraction = respostaJson.point_of_interaction;
    const qrCodeBase64 = pointOfInteraction?.transaction_data?.qr_code_base64;
    const qrCode = pointOfInteraction?.transaction_data?.qr_code;

    return res.json({
      success: true,
      qr_code_base64: qrCodeBase64,
      qr_code: qrCode,
      payment_id: respostaJson.id
    });

  } catch (error) {
    console.error('Erro interno no servidor:', error);
    return res.status(500).json({ erro: 'Erro interno ao processar o Pix.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
