// api/mercadopago-criar-pix.js

export default async function handler(req, res) {
  // CORS básico (se seu front estiver no mesmo domínio, não precisa, mas não atrapalha)
  res.setHeader("Access-Control-Allow-Origin", "*");
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

  try {
    // Vercel normalmente já entrega req.body como objeto quando vem Content-Type: application/json
    // Mas se vier como string, tentamos converter.
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // Ajuste estes campos conforme seu front envia:
    // Ex.: { amount: 19.9, email: "cliente@email.com", external_reference: "pedido_123" }
    const amount = Number(body.amount);
    const email = String(body.email || "").trim();
    const externalReference =
      String(body.external_reference || "").trim() || `pedido_${Date.now()}`;

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "invalid_amount" });
    }

    if (!email) {
      return res.status(400).json({ error: "missing_email" });
    }

    // IMPORTANTE:
    // total_amount precisa bater com a soma de transactions.payments[].amount
    const payload = {
      type: "online",
      external_reference: externalReference,
      total_amount: amount,
      processing_mode: "automatic",
      payer: {
        email: email,
      },
      transactions: {
        payments: [
          {
            amount: amount,
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
            // Opcional: validade do Pix (ISO 8601 duration). Ex.: "PT30M" (30 min)
            // expiration_time: "PT30M",
          },
        ],
      },
    };

    // Idempotency key (evita duplicar cobrança em re-tentativas)
    const idemKey =
      (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) ||
      `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`; // fallback simples

    const mpResp = await fetch("https://api.mercadopago.com/v1/orders", {
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
      // Se Mercado Pago retornar algo não-JSON (raro), devolvemos para debug
      return res.status(502).json({
        error: "mp_non_json_response",
        mp_status: mpResp.status,
        details: responseText,
      });
    }

    // Se Mercado Pago retornou erro, devolve o erro real para o front (pra você ver no Network)
    if (!mpResp.ok) {
      console.error("MP error:", mpResp.status, data);
      return res.status(mpResp.status).json(data);
    }

    // Extrai o que você vai usar no front (ticket_url, qr etc.)
    const payment = data?.transactions?.payments?.[0] || {};
    const ticketUrl = payment?.ticket_url || null;
    const qrCode = payment?.qr_code || null;
    const qrCodeBase64 = payment?.qr_code_base64 || null;

    return res.status(200).json({
      order_id: data?.id || null,
      status: data?.status || null,
      status_detail: data?.status_detail || null,
      ticket_url: ticketUrl,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      raw: data, // se quiser, pode remover depois que estiver funcionando
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "server_error",
      message: err?.message || String(err),
    });
  }
}
