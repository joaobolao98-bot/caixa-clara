// api/webhook.js
// Webhook do Stripe para a Vercel. Ele "liga o interruptor" do cliente no Supabase
// assim que o pagamento é confirmado (e "desliga" se ele cancelar).
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel):
//   STRIPE_SECRET_KEY          -> chave secreta do Stripe (sk_...)
//   STRIPE_WEBHOOK_SECRET      -> assinatura do endpoint (whsec_...), gerada ao criar o webhook no Stripe
//   SUPABASE_URL               -> a mesma URL usada no index.html
//   SUPABASE_SERVICE_ROLE_KEY  -> a "service role key" do Supabase (NUNCA a anon key, e NUNCA no front-end)
//
// No Stripe Dashboard: Developers > Webhooks > Add endpoint
//   URL: https://SEU-DOMINIO.vercel.app/api/webhook
//   Eventos: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// A Vercel precisa do corpo "cru" (não parseado) para validar a assinatura do Stripe.
module.exports.config = {
  api: { bodyParser: false }
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Assinatura do webhook inválida:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // client_reference_id foi setado no front-end como o id do usuário no Supabase
        // (veja simularAssinatura() no index.html).
        const userId = session.client_reference_id;
        const stripeCustomerId = session.customer;

        if (!userId) {
          console.warn('checkout.session.completed sem client_reference_id, ignorando.');
          break;
        }

        await supabase.from('assinaturas').upsert({
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          status: 'ativo',
          atualizado_em: new Date().toISOString()
        });
        break;
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj = event.data.object;
        const stripeCustomerId = obj.customer;

        await supabase
          .from('assinaturas')
          .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
          .eq('stripe_customer_id', stripeCustomerId);
        break;
      }

      default:
        // outros eventos são ignorados
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro ao processar webhook:', err);
    res.status(500).json({ error: 'Erro interno ao processar o webhook.' });
  }
};
