import { checkPasscode, requirePost, openai, fail } from "./_lib.js";
import { cloudOn, safeId, putPicture } from "./_blob.js";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";

export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkPasscode(req, res)) return;
  const { scene, style, characters, age, bookId, idx } = req.body || {};
  const years = Math.min(8, Math.max(2, Number(age) || 3));
  if (typeof scene !== "string" || !scene.trim()) return res.status(400).json({ error: "bad_request", message: "Missing scene." });

  const prompt = [
    `A full-bleed illustration for a picture book for a ${years}-year-old.`,
    `Art style: ${String(style || "soft watercolor and colored pencil, warm gentle colors, rounded friendly shapes, simple uncluttered background").slice(0, 400)}.`,
    characters ? `Recurring characters (keep them looking exactly like this): ${String(characters).slice(0, 800)}.` : "",
    `This page shows: ${scene.slice(0, 800)}.`,
    "Gentle, happy, safe, and age-appropriate. Do not include any words, letters, numbers or writing anywhere in the picture."
  ].filter(Boolean).join("\n");

  try {
    const data = await openai("/images/generations", {
      model: MODEL, prompt, n: 1, size: "1024x1024", quality: QUALITY,
      output_format: "webp", output_compression: 80
    });
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw Object.assign(new Error("No image came back."), { status: 502, code: "no_image" });
    const page = Math.max(0, Math.min(99, Number(idx) || 0));
    if (cloudOn() && safeId(bookId)) {
      return res.status(200).json({ image: await putPicture(bookId, page, Buffer.from(b64, "base64"), "image/webp") });
    }
    res.status(200).json({ image: `data:image/webp;base64,${b64}` });
  } catch (e) {
    fail(res, e);
  }
}
