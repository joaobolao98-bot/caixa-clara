const responseText = await mpResp.text();
let data;
try {
    data = JSON.parse(responseText);
} catch (e) {
    console.error("Resposta não é JSON:", responseText);
    return res.status(500).json({ error: "Erro interno", details: responseText });
}

if (!mpResp.ok) {
    console.error("Erro do Mercado Pago:", data);
    return res.status(mpResp.status).json({ error: data });
}

return res.status(200).json(data);
