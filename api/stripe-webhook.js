const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Vercel precisa do corpo "cru" (não convertido em JSON) para o Stripe
// conseguir verificar a assinatura do webhook.
module.exports.config = {
  api: { bodyParser: false }
};

function lerCorpoBruto(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    req.on('data', (c) => pedacos.push(c));
    req.on('end', () => resolve(Buffer.concat(pedacos)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let event;
  try {
    const corpoBruto = await lerCorpoBruto(req);
    const assinatura = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(corpoBruto, assinatura, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Assinatura do webhook inválida:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      // Pagamento do checkout confirmado: liga o usuário ao cliente do Stripe e ativa o plano
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (userId) {
          await supabase.from('assinaturas').upsert({
            user_id: userId,
            status: 'ativo',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            atualizado_em: new Date().toISOString()
          }, { onConflict: 'user_id' });
        }
        break;
      }

      // Cobrança do mês falhou: marca como inadimplente (a assinatura no Stripe ainda tenta de novo sozinha)
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await supabase.from('assinaturas')
          .update({ status: 'inadimplente', atualizado_em: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer);
        break;
      }

      // Assinatura cancelada ou encerrada no Stripe: tira o acesso
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await supabase.from('assinaturas')
          .update({ status: 'inativo', atualizado_em: new Date().toISOString() })
          .eq('stripe_customer_id', subscription.customer);
        break;
      }

      // Cobrança voltou a funcionar depois de uma falha
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await supabase.from('assinaturas')
          .update({ status: 'ativo', atualizado_em: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer);
        break;
      }

      default:
        // outros eventos não precisam de ação aqui
        break;
    }

    res.status(200).json({ recebido: true });
  } catch (err) {
    console.error('Erro processando o webhook:', err);
    res.status(500).send('Erro interno ao processar o evento');
  }
};
