// Endpoint público de "está no ar?". Não deve revelar detalhes de
// configuração interna (como quais variáveis de ambiente existem),
// pois isso ajuda um atacante a mapear o sistema.
export default function handler(req, res) {
  return res.status(200).json({ status: 'ok' });
}
