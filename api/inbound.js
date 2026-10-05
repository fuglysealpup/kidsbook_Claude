import { allowedEmails, fail } from "./_lib.js";
import { cloudOn, addInboxItem } from "./_blob.js";
import { timingSafeEqual } from "node:crypto";

// Postmark's inbound webhook: a forwarded class newsletter arrives here and waits in the
// app's "This week's newsletter is here" card. Set the webhook URL in Postmark to
//   https://<your app>/api/inbound?key=<INBOUND_SECRET>
// Only emails sent from an address on ALLOWED_EMAILS are kept.
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const MAX_TEXT = 20000;

function textFrom(mail) {
  const text = String(mail.TextBody || "").trim();
  if (text) return text;
  return String(mail.HtmlBody || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const secret = process.env.INBOUND_SECRET;
  const url = new URL(req.url, "http://x");
  if (!secret || !same(url.searchParams.get("key") || "", secret)) return res.status(401).json({ error: "unauthorized" });
  if (!cloudOn()) return res.status(503).json({ error: "no_storage", message: "Connect a Blob store first." });

  const mail = req.body || {};
  const from = String(mail.FromFull?.Email || mail.From || "").toLowerCase().replace(/^.*<|>.*$/g, "").trim();
  // Answer 200 for senders we ignore, so Postmark doesn't keep retrying them.
  if (!allowedEmails().includes(from)) return res.status(200).json({ ignored: true });

  try {
    const pdfs = (Array.isArray(mail.Attachments) ? mail.Attachments : [])
      .filter((a) => a && typeof a.Content === "string" && (a.ContentType === "application/pdf" || /\.pdf$/i.test(a.Name || "")))
      .slice(0, 3)
      .map((a) => ({ name: String(a.Name || "newsletter.pdf"), bytes: Buffer.from(a.Content, "base64") }));
    const item = await addInboxItem({
      receivedAt: new Date().toISOString(),
      from,
      subject: String(mail.Subject || "Class newsletter").slice(0, 200),
      text: textFrom(mail).slice(0, MAX_TEXT)
    }, pdfs);
    res.status(200).json({ ok: true, id: item.id });
  } catch (e) {
    fail(res, e);
  }
}
