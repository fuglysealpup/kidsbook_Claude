import { createRemoteJWKSet, jwtVerify } from "jose";
import { requirePost, allowedEmails, makeSessionCookie, clearSessionCookie, fail, httpError } from "./_lib.js";

// Sign in with Google or Apple directly: the browser gets a signed ID token from the provider,
// we check its signature against the provider's public keys, check the email is on
// ALLOWED_EMAILS, and set our own signed session cookie.
const PROVIDERS = {
  google: {
    jwks: () => createRemoteJWKSet(new URL(process.env.GOOGLE_JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs")),
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: () => process.env.GOOGLE_CLIENT_ID
  },
  apple: {
    jwks: () => createRemoteJWKSet(new URL(process.env.APPLE_JWKS_URL || "https://appleid.apple.com/auth/keys")),
    issuer: ["https://appleid.apple.com"],
    audience: () => process.env.APPLE_SERVICE_ID
  }
};
const keySets = {};

export default async function handler(req, res) {
  if (!requirePost(req, res)) return;
  const { provider, token, action } = req.body || {};
  if (action === "signout") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ signedIn: false });
  }
  const p = PROVIDERS[provider];
  try {
    if (!p || !p.audience()) throw httpError(400, "bad_request", "That sign-in option isn't set up.");
    if (typeof token !== "string" || token.length > 8000) throw httpError(400, "bad_request", "Missing sign-in token.");
    keySets[provider] ||= p.jwks();
    let payload;
    try {
      ({ payload } = await jwtVerify(token, keySets[provider], { issuer: p.issuer, audience: p.audience() }));
    } catch {
      throw httpError(401, "signin", "That sign-in didn't check out. Try again.");
    }
    const email = String(payload.email || "").toLowerCase();
    const verified = payload.email_verified === true || payload.email_verified === "true";
    if (!email || !verified) throw httpError(401, "signin", "Your account needs a verified email address.");
    const list = allowedEmails();
    if (!list.length) throw httpError(403, "not_allowed", "No family emails are set up yet. Add yours to ALLOWED_EMAILS in Vercel.");
    if (!list.includes(email)) throw httpError(403, "not_allowed", `${email} isn't on this family's list. Ask the owner to add it.`);
    res.setHeader("Set-Cookie", makeSessionCookie(email));
    res.status(200).json({ signedIn: true, email });
  } catch (e) {
    fail(res, e);
  }
}
