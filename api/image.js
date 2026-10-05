import { checkAuth, requirePost, openai, openaiForm, fail, fetchStored } from "./_lib.js";
import { cloudOn, safeId, putPicture } from "./_blob.js";
import { DEFAULT_STYLE } from "./_prompt.js";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";

// Draw one page. When the hero is in the picture and a character sheet exists, the sheet goes
// along as a reference image so the hero looks the same on every page and in every book.
export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  const { scene, style, characters, age, bookId, idx, heroSheet, heroInScene } = req.body || {};
  if (typeof scene !== "string" || !scene.trim()) return res.status(400).json({ error: "bad_request", message: "Missing scene." });
  const years = Math.min(8, Math.max(2, Number(age) || 3));
  const useSheet = !!heroSheet && heroInScene !== false;

  const prompt = [
    `A full-bleed illustration for a picture book for a ${years}-year-old.`,
    `Art style: ${String(style || DEFAULT_STYLE).slice(0, 400)}.`,
    characters ? `Recurring characters (keep them looking exactly like this): ${String(characters).slice(0, 900)}.` : "",
    useSheet ? "The attached image is the hero's character reference sheet. Draw that same character, with the same face, hair and clothes, in this new scene. Do not copy the sheet's layout or white background." : "",
    `This page shows: ${scene.slice(0, 800)}.`,
    "Gentle, happy, safe, and age-appropriate. Do not include any words, letters, numbers or writing anywhere in the picture."
  ].filter(Boolean).join("\n");

  try {
    let data;
    if (useSheet) {
      const ref = await fetchStored(heroSheet);
      const send = (extras) => {
        const form = new FormData();
        form.append("model", MODEL);
        form.append("prompt", prompt);
        form.append("size", "1024x1024");
        form.append("quality", QUALITY);
        form.append("image[]", new Blob([ref.bytes], { type: ref.type }), "hero." + (ref.type.split("/")[1] || "png"));
        for (const [k, v] of Object.entries(extras)) form.append(k, v);
        return openaiForm("/images/edits", form);
      };
      try {
        data = await send({ input_fidelity: "high", output_format: "webp", output_compression: "80" });
      } catch (e) {
        // Some image models don't take these options; try once more without them.
        if (e.openaiStatus !== 400) throw e;
        data = await send({});
      }
    } else {
      data = await openai("/images/generations", {
        model: MODEL, prompt, n: 1, size: "1024x1024", quality: QUALITY, output_format: "webp", output_compression: 80
      });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw Object.assign(new Error("No image came back."), { status: 502, code: "no_image" });
    const bytes = Buffer.from(b64, "base64");
    const type = bytes.subarray(0, 4).toString() === "RIFF" ? "image/webp" : bytes[0] === 0xff ? "image/jpeg" : "image/png";
    const page = Math.max(0, Math.min(99, Number(idx) || 0));
    if (cloudOn() && safeId(bookId)) {
      return res.status(200).json({ image: await putPicture(`books/${bookId}`, String(page), bytes, type) });
    }
    res.status(200).json({ image: `data:${type};base64,${b64}` });
  } catch (e) {
    fail(res, e);
  }
}
