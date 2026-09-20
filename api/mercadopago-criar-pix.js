const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
        transaction_amount: Number(payload.transaction_amount),
        description: payload.description || "Pagamento via Pix",
        payment_method_id: "pix",
        payer: {
            email: payload.email || "cliente@email.com",
            first_name: payload.firstName || "Nome",
            last_name: payload.lastName || "Sobrenome",
            identification: {
                type: payload.docType || "CPF",
                number: payload.docNumber || "00000000000"
            }
        }
    }),
});
