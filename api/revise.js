import { checkAuth, requirePost, openaiJson, fail, TEXT_MODEL } from "./_lib.js";
import { buildRevisePrompt, buildAnnotatePrompt, clean } from "./_prompt.js";

// Two kinds of edits during review:
//   mode "chat":     a free-form request ("make the dog the main character") rewrites the story.
//   mode "annotate": the parent changed Chinese text by hand; fill in sound guide, English and picture notes.
export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  const { mode, story, settings = {}, instruction = "", pages = [], keepEnglish = [] } = req.body || {};
  if (!story || !Array.isArray(story.pages) || !story.pages.length) {
    return res.status(400).json({ error: "bad_request", message: "That story is missing pieces." });
  }
  try {
    if (mode === "chat") {
      if (!String(instruction).trim()) return res.status(400).json({ error: "bad_request", message: "Say what you'd like changed." });
      const updated = clean(await openaiJson(buildRevisePrompt(settings, story, instruction), TEXT_MODEL), settings);
      return res.status(200).json({ story: updated });
    }
    if (mode === "annotate") {
      const idxs = [...new Set(pages.map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < story.pages.length).slice(0, 14);
      if (!idxs.length) return res.status(200).json({ pages: [] });
      const out = await openaiJson(buildAnnotatePrompt(settings, story, idxs, keepEnglish.map(Number)), TEXT_MODEL);
      const str = (v) => (typeof v === "string" ? v : "");
      const fixed = (Array.isArray(out.pages) ? out.pages : [])
        .filter((p) => idxs.includes(Number(p?.i)))
        .map((p) => ({ i: Number(p.i), phon: settings.phonetic === "none" ? "" : str(p.phon), en: str(p.en), illustration: str(p.illustration), hero: p.hero !== false }));
      return res.status(200).json({ pages: fixed });
    }
    res.status(400).json({ error: "bad_request", message: "Unknown edit." });
  } catch (e) {
    fail(res, e);
  }
}
