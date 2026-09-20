export default function handler(req, res) {
  return res.status(200).json({
    has_mp_access_token: Boolean(process.env.MP_ACCESS_TOKEN),
    node_env: process.env.NODE_ENV
  });
}
