import { checkAuth, requirePost, openai, openaiForm, fail, fetchStored } from "./_lib.js";
import { cloudOn, safeId, putPicture } from "./_blob.js";
import { DEFAULT_STYLE } from "./_prompt.js";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || "medium";

// Draw one page. Reference images keep characters looking the same: the hero's character sheet
// (same hero in every book) and the book's cast sheet (the other recurring characters in this book).
// kind "cast" draws that cast sheet itself, once per book, before the pages.
export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  const { kind, scene, style, characters, supporting, age, bookId, idx, heroSheet, heroInScene, castSheet } = req.body || {};
  const cast = kind === "cast";
  if (cast ? typeof supporting !== "string" || !supporting.trim() : typeof scene !== "string" || !scene.trim()) {
    return res.status(400).json({ error: "bad_request", message: cast ? "No characters to draw." : "Missing scene." });
  }
  const years = Math.min(8, Math.max(2, Number(age) || 3));
  const artStyle = `Art style: ${String(style || DEFAULT_STYLE).slice(0, 400)}.`;
  const refs = [];
  if (!cast && heroSheet && heroInScene !== false) refs.push({ url: heroSheet, name: "hero", note: "the hero's character sheet: draw that same character, with the same face, hair and clothes" });
  if (!cast && castSheet) refs.push({ url: castSheet, name: "cast", note: "this book's cast sheet: any of these characters who appear on this page keep exactly the same look, colors and outfit" });

  const prompt = cast ? [
    `A character reference sheet for a picture book for a ${years}-year-old.`,
    artStyle,
    `Draw each of these characters once, full body, facing forward, standing side by side on a plain white background, evenly spaced and not overlapping: ${supporting.slice(0, 900)}.`,
    "Clear, simple shapes and flat colors so they are easy to draw again. Do not include any words, letters, names or labels."
  ].join("\n") : [
    `A full-bleed illustration for a picture book for a ${years}-year-old.`,
    artStyle,
    characters ? `Recurring characters (keep them looking exactly like this): ${String(characters).slice(0, 900)}.` : "",
    supporting ? `Other recurring characters (same outfit and colors on every page): ${String(supporting).slice(0, 900)}.` : "",
    refs.length ? `Attached reference image${refs.length > 1 ? "s" : ""}: ${refs.map((r, i) => `${refs.length > 1 ? `image ${i + 1} is ` : ""}${r.note}`).join("; ")}. Only draw the characters this page needs. Do not copy a sheet's layout or white background.` : "",
    `This page shows: ${scene.slice(0, 800)}.`,
    "Gentle, happy, safe, and age-appropriate. Do not include any words, letters, numbers or writing anywhere in the picture."
  ].filter(Boolean).join("\n");

  try {
    let data;
    if (refs.length) {
      const files = await Promise.all(refs.map(async (r) => ({ ...r, ...(await fetchStored(r.url)) })));
      const send = (extras) => {
        const form = new FormData();
        form.append("model", MODEL);
        form.append("prompt", prompt);
        form.append("size", "1024x1024");
        form.append("quality", QUALITY);
        for (const f of files) form.append("image[]", new Blob([f.bytes], { type: f.type }), `${f.name}.${f.type.split("/")[1] || "png"}`);
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
        model: MODEL, prompt, n: 1, size: cast ? "1536x1024" : "1024x1024", quality: QUALITY, output_format: "webp", output_compression: 80
      });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw Object.assign(new Error("No image came back."), { status: 502, code: "no_image" });
    const bytes = Buffer.from(b64, "base64");
    const type = bytes.subarray(0, 4).toString() === "RIFF" ? "image/webp" : bytes[0] === 0xff ? "image/jpeg" : "image/png";
    const page = Math.max(0, Math.min(99, Number(idx) || 0));
    if (cloudOn() && safeId(bookId)) {
      return res.status(200).json({ image: await putPicture(`books/${bookId}`, cast ? "cast" : String(page), bytes, type) });
    }
    res.status(200).json({ image: `data:${type};base64,${b64}` });
  } catch (e) {
    fail(res, e);
  }
}
