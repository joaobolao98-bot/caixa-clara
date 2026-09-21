import { createClient } from '@supabase/supabase-js';

// Preço do plano definido AQUI, no servidor. Nunca confie em um valor de
// "amount" enviado pelo navegador — quem controla o valor é quem paga,
// então isso tem que vir sempre de uma constante do backend.
const PRECO_PLANO_BRL = 19.90;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // Restringe quem pode chamar este endpoint via navegador ao seu próprio site.
  // Configure SITE_URL nas variáveis de ambiente da Vercel com o domínio final.
  const origemPermitida = process.env.SITE_URL || "https://caixa-clara-five.vercel.app";
  res.setHeader("Access-Control-Allow-Origin", origemPermitida);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "missing_mp_access_token" });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("SUPABASE_URL ou SUPABASE_ANON_KEY não configurados.");
    return res.status(500).json({ error: "missing_supabase_config" });
  }

  // 1. Exige que quem está pedindo o Pix esteja realmente logado.
  //    O front-end precisa mandar o access_token da sessão do Supabase
  //    no header Authorization: Bearer <token>.
  const authHeader = req.headers.authorization || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!jwt) {
    return res.status(401).json({ error: "unauthorized", mensagem: "É necessário estar logado para gerar o pagamento." });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);

  if (userError || !userData?.user) {
    return res.status(401).json({ error: "invalid_token", mensagem: "Sessão inválida ou expirada. Faça login novamente." });
  }

  const usuarioLogado = userData.user;

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    // 2. O valor cobrado é sempre o preço fixo do plano — nunca o que vier
    //    do corpo da requisição. Isso impede que alguém pague um valor
    //    menor (ex.: R$0,01) alterando a chamada no navegador.
    const amount = PRECO_PLANO_BRL;
    const email = String(usuarioLogado.email || body.email || "cliente@teste.com").trim();

    // 3. external_reference é sempre o ID do usuário autenticado no Supabase,
    //    nunca um valor arbitrário vindo do front-end. É esse campo que o
    //    webhook usa para saber de quem é a assinatura — se ele pudesse ser
    //    forjado, qualquer um poderia liberar acesso pago para a conta de
    //    outra pessoa (ou nem ligar o pagamento a conta nenhuma).
    const externalReference = usuarioLogado.id;

    const payload = {
      transaction_amount: amount,
      description: `Assinatura Caixa Clara - Plano Profissional`,
      payment_method_id: "pix",
      payer: {
        email: email,
      },
      external_reference: externalReference,
    };

    const idemKey = `idem_${usuarioLogado.id}_${Date.now()}`;

    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idemKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await mpResp.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Resposta não-JSON do Mercado Pago:", responseText);
      return res.status(502).json({ error: "mp_non_json_response" });
    }

    if (!mpResp.ok) {
      // Log completo fica só no servidor; ao cliente devolvemos algo genérico
      // para não vazar detalhes internos da integração com o Mercado Pago.
      console.error("MP error:", mpResp.status, data);
      return res.status(mpResp.status).json({ error: "mp_error" });
    }

    const pointOfInteraction = data?.point_of_interaction || {};
    const transactionData = pointOfInteraction?.transaction_data || {};

    return res.status(200).json({
      order_id: data?.id || null,
      status: data?.status || null,
      status_detail: data?.status_detail || null,
      ticket_url: transactionData?.ticket_url || null,
      qr_code: transactionData?.qr_code || null,
      qr_code_base64: transactionData?.qr_code_base64 || null,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
