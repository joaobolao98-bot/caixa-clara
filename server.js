const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Certifique-se de instalar: npm install express cors node-fetch

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Se o seu index.html estiver numa pasta chamada 'public'

// Cole aqui o seu Access Token de Produção do Mercado Pago
const MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-3708744356340977-092012-6e2910508752b1eecc69194ad25311cf-146682138';

app.post('/api/mercadopago-criar-pix', async (req, res) => {
  try {
    const { amount, email, external_reference } = req.body;

    const dadosPagamento = {
      transaction_amount: Number(amount),
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
        'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
      },
      body: JSON.stringify(dadosPagamento)
    });

    const respostaJson = await respostaMP.json();

    if (!respostaMP.ok) {
      console.error('Erro retornado pelo Mercado Pago:', respostaJson);
      return res.status(500).json({ erro: 'Erro ao gerar pagamento no Mercado Pago', detalhes: respostaJson });
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
