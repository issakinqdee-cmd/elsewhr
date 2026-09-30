export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "elsewhr",
    time: new Date().toISOString(),
  });
}
