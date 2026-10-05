import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const OPENAI = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const SESSION_COOKIE = "sw_session";
const SESSION_DAYS = 60;

/* ---------- who may use the app ---------- */

// "login" when Google or Apple sign-in is configured, "passcode" when only APP_PASSCODE is set,
// and "none" for local use with neither.
export function authMode() {
  if (process.env.GOOGLE_CLIENT_ID || process.env.APPLE_SERVICE_ID) return "login";
  if (process.env.APP_PASSCODE) return "passcode";
  return "none";
}

export const allowedEmails = () =>
  (process.env.ALLOWED_EMAILS || "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Sessions are signed with SESSION_SECRET. When it isn't set, a key derived from the
// OpenAI key is used instead, which is also server-only, so there's one less thing to set up.
function sessionKey() {
  const secret = process.env.SESSION_SECRET || process.env.OPENAI_API_KEY || "";
  return createHash("sha256").update("story-week-session:" + secret).digest();
}
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sign = (data) => b64url(createHmac("sha256", sessionKey()).update(data).digest());

export function makeSessionCookie(email) {
  const payload = b64url(JSON.stringify({ email, exp: Date.now() + SESSION_DAYS * 864e5 }));
  const value = `${payload}.${sign(payload)}`;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readSession(req) {
  const raw = String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  if (!raw) return null;
  const [payload, sig] = raw.slice(SESSION_COOKIE.length + 1).split(".");
  if (!payload || !sig || !same(sig, sign(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!s.email || s.exp < Date.now()) return null;
    if (!allowedEmails().includes(String(s.email).toLowerCase())) return null;
    return s;
  } catch {
    return null;
  }
}

export function checkAuth(req, res) {
  const mode = authMode();
  if (mode === "none") return true;
  if (mode === "passcode") {
    if (same(req.headers["x-passcode"] || "", process.env.APP_PASSCODE)) return true;
    res.status(401).json({ error: "passcode", message: "Enter the app passcode in settings." });
    return false;
  }
  if (readSession(req)) return true;
  res.status(401).json({ error: "signin", message: "Sign in to continue." });
  return false;
}

/* ---------- request helpers ---------- */

export function requirePost(req, res) {
  if (req.method === "POST") return true;
  res.setHeader("Allow", "POST");
  res.status(405).json({ error: "method", message: "Use POST." });
  return false;
}

export function fail(res, e) {
  res.status(e.status || 500).json({ error: e.code || "server_error", message: e.message || "Something went wrong." });
}

export const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

/* ---------- OpenAI ---------- */

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw httpError(500, "no_key", "OPENAI_API_KEY is not set on the server.");
  return k;
}

async function parse(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `OpenAI returned ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status === 429 ? 429 : 502, code: data?.error?.code || "openai_error", openaiStatus: r.status });
  }
  return data;
}

export async function openai(path, body) {
  const r = await fetch(OPENAI + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify(body)
  });
  return parse(r);
}

export async function openaiForm(path, form) {
  const r = await fetch(OPENAI + path, { method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form });
  return parse(r);
}

// Ask the text model for one JSON object.
export async function openaiJson(content, model) {
  const body = { model, messages: [{ role: "user", content }], response_format: { type: "json_object" } };
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = "low";
  const data = await openai("/chat/completions", body);
  const text = data?.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(502, "invalid_json", "The story came back garbled. Try again.");
  }
}

export const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";

/* ---------- fetching our own stored files ---------- */

// Only fetch from Vercel Blob (or hosts listed for local testing), never arbitrary URLs.
export async function fetchStored(urlOrData) {
  const s = String(urlOrData || "");
  const m = /^data:([^;]+);base64,(.+)$/.exec(s);
  if (m) return { bytes: Buffer.from(m[2], "base64"), type: m[1] };
  let u;
  try { u = new URL(s); } catch { throw httpError(400, "bad_request", "That file link isn't valid."); }
  const extra = (process.env.ALLOW_FETCH_HOSTS || "").split(",").filter(Boolean);
  const ok = (u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com")) || extra.includes(u.host);
  if (!ok) throw httpError(400, "bad_request", "That file isn't from this app's storage.");
  const r = await fetch(u);
  if (!r.ok) throw httpError(502, "fetch_failed", "Couldn't load a saved file.");
  return { bytes: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
}
