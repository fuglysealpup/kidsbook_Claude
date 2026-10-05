import { checkPasscode, requirePost, fail } from "./_lib.js";
import { cloudOn, safeId, listBooks, saveBook, deleteBook } from "./_blob.js";

const MAX_STORY_BYTES = 4_000_000;

export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkPasscode(req, res)) return;
  if (!cloudOn()) return res.status(200).json({ cloud: false });
  const { action, story, id } = req.body || {};
  try {
    if (action === "list") return res.status(200).json({ cloud: true, stories: await listBooks() });
    if (action === "save") {
      if (!story || !safeId(story.id) || !Array.isArray(story.pages)) return res.status(400).json({ error: "bad_request", message: "That book is missing pieces." });
      if (JSON.stringify(story).length > MAX_STORY_BYTES) return res.status(413).json({ error: "too_big", message: "That book is too big to save." });
      return res.status(200).json({ cloud: true, story: await saveBook(story) });
    }
    if (action === "delete") {
      if (!safeId(id)) return res.status(400).json({ error: "bad_request", message: "Unknown book." });
      await deleteBook(id);
      return res.status(200).json({ cloud: true });
    }
    res.status(400).json({ error: "bad_request", message: "Unknown action." });
  } catch (e) {
    fail(res, { status: 502, code: "storage_error", message: `Couldn't reach cloud storage: ${e.message}` });
  }
}
