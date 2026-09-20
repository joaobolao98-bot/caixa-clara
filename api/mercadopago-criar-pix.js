export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const payload = req.body; // aqui você monta o body do /v1/orders

    const mpResp = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const data = await mpResp.json();

    if (!mpResp.ok) {
      console.error("MP error:", mpResp.status, data);
      return res.status(500).json({ mp_status: mpResp.status, mp_error: data });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "server_error" });
  }
}
