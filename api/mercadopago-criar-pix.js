export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  if (!process.env.MP_ACCESS_TOKEN) {
    console.error("Missing MP_ACCESS_TOKEN");
    return res.status(500).json({ error: "missing_mp_access_token" });
  }

  try {
    const payload = req.body; // ou monte o payload aqui

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
      // devolve o erro real pro browser:
      return res.status(mpResp.status).json(data);
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ error: "server_error" });
  }
}
