export default async function handler(req, res) {
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
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    const amount = Number(body.amount);
    const email = String(body.email || "cliente@teste.com").trim();
    const externalReference = String(body.external_reference || "").trim() || `pedido_${Date.now()}`;

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "invalid_amount" });
    }

    const payload = {
      transaction_amount: amount,
      description: `Pedido ${externalReference}`,
      payment_method_id: "pix",
      payer: {
        email: email,
      },
      external_reference: externalReference,
    };

    const idemKey = `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;

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
      return res.status(502).json({
        error: "mp_non_json_response",
        mp_status: mpResp.status,
        details: responseText,
      });
    }

    if (!mpResp.ok) {
      console.error("MP error:", mpResp.status, data);
      return res.status(mpResp.status).json(data);
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
    return res.status(500).json({
      error: "server_error",
      message: err?.message || String(err),
    });
  }
}
