import { checkAuth, requirePost, openai, openaiJson, fail, TEXT_MODEL } from "./_lib.js";
import { cloudOn, putPicture } from "./_blob.js";
import { DEFAULT_STYLE } from "./_prompt.js";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

// Make the hero's character sheet: one drawing of the child as a picture-book character,
// reused as the reference for every page. A photo, if given, is only used to write a
// description of the look. It is not stored and is not sent to the image model.
export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  const { description = "", photo, style, age, name } = req.body || {};
  const years = Math.min(8, Math.max(2, Number(age) || 3));
  let look = String(description).trim().slice(0, 600);
  try {
    if (typeof photo === "string" && photo.startsWith("data:image/")) {
      const out = await openaiJson([
        { type: "text", text: `A parent wants their child drawn as the hero of a children's picture book. Describe the child's look for an illustrator in 2 or 3 English sentences: apparent age, hair (color, length, style), skin tone, eye shape, face shape, and clothing colors. Keep it cartoon-friendly and kind. Do not guess a name, location or anything not visible. ${look ? `The parent also wrote: "${look}". Include their details.` : ""} Reply with only JSON: {"description":"…"}` },
        { type: "image_url", image_url: { url: photo } }
      ], TEXT_MODEL);
      if (typeof out.description === "string" && out.description.trim()) look = out.description.trim().slice(0, 600);
    }
    if (!look) return res.status(400).json({ error: "bad_request", message: "Describe your hero or add a photo." });

    const prompt = [
      `Character reference sheet for a children's picture book. The hero is a ${years}-year-old${name ? ` named ${String(name).slice(0, 40)}` : ""}.`,
      `Look: ${look}`,
      `Art style: ${String(style || DEFAULT_STYLE).slice(0, 300)}.`,
      "Show the same character three times side by side on a plain white background: standing facing forward, standing in side view, and waving happily.",
      "Friendly, gentle and age-appropriate. No words, letters or numbers."
    ].join("\n");
    const data = await openai("/images/generations", { model: MODEL, prompt, n: 1, size: "1536x1024", quality: "medium", output_format: "webp", output_compression: 85 });
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw Object.assign(new Error("No picture came back."), { status: 502, code: "no_image" });
    const sheet = cloudOn() ? await putPicture("profile", "hero", Buffer.from(b64, "base64"), "image/webp") : `data:image/webp;base64,${b64}`;
    res.status(200).json({ hero: { description: look, sheet, style: String(style || DEFAULT_STYLE).slice(0, 300) } });
  } catch (e) {
    fail(res, e);
  }
}
