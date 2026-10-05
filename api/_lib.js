import { timingSafeEqual } from "node:crypto";

const OPENAI = "https://api.openai.com/v1";

export function checkPasscode(req, res) {
  const want = process.env.APP_PASSCODE;
  if (!want) return true;
  const got = String(req.headers["x-passcode"] || "");
  const a = Buffer.from(got), b = Buffer.from(want);
  if (a.length === b.length && timingSafeEqual(a, b)) return true;
  res.status(401).json({ error: "passcode", message: "Enter the app passcode in settings." });
  return false;
}

export function requirePost(req, res) {
  if (req.method === "POST") return true;
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "method", message: "Use POST." });
  return false;
}

export async function openai(path, body) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error("OPENAI_API_KEY is not set on the server."), { status: 500, code: "no_key" });
  const r = await fetch(OPENAI + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI returned ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status === 429 ? 429 : 502, code: data?.error?.code || "openai_error" });
  }
  return data;
}

export function fail(res, e) {
  res.status(e.status || 500).json({ error: e.code || "server_error", message: e.message || "Something went wrong." });
}
