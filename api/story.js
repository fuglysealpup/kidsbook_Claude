import { checkAuth, requirePost, openaiJson, fail, fetchStored, TEXT_MODEL } from "./_lib.js";
import { buildStoryPrompt, clean } from "./_prompt.js";
import { cloudOn, safeId, getInboxItem } from "./_blob.js";

export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  const { settings = {}, lesson = "", images = [], inboxId } = req.body || {};
  const pics = (Array.isArray(images) ? images : []).filter((u) => typeof u === "string" && u.startsWith("data:image/")).slice(0, 4);

  try {
    // A forwarded newsletter's PDFs go to the model as files.
    const files = [];
    if (inboxId && cloudOn() && safeId(inboxId)) {
      const item = await getInboxItem(inboxId);
      for (const pdf of (item?.pdfs || []).slice(0, 3)) {
        const { bytes } = await fetchStored(pdf.url);
        files.push({ type: "file", file: { filename: pdf.name || "newsletter.pdf", file_data: `data:application/pdf;base64,${bytes.toString("base64")}` } });
      }
    }
    if (String(lesson).trim().length < 20 && !pics.length && !files.length) {
      return res.status(400).json({ error: "bad_request", message: "Add the newsletter first." });
    }
    const content = [{ type: "text", text: buildStoryPrompt(settings, String(lesson), pics.length + files.length > 0) }, ...files];
    for (const url of pics) content.push({ type: "image_url", image_url: { url } });

    const story = clean(await openaiJson(content, TEXT_MODEL), settings);
    if (settings.hero?.sheet) story.hero = { sheet: settings.hero.sheet, description: settings.hero.description || "" };
    res.status(200).json({ story: { ...story, status: "draft" } });
  } catch (e) {
    fail(res, e);
  }
}
