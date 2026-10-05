import { checkAuth, requirePost, fail } from "./_lib.js";
import {
  cloudOn, safeId, listBooks, saveBook, deleteBook, getProfile, saveProfile, listInbox, deleteInboxItem
} from "./_blob.js";

const MAX_BYTES = 4_000_000;

// Cloud storage for the bookshelf, the child's profile and forwarded newsletters.
// Without a Blob store the app keeps everything on each device instead.
export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkAuth(req, res)) return;
  if (!cloudOn()) return res.status(200).json({ cloud: false });
  const { action, story, id, profile } = req.body || {};
  try {
    switch (action) {
      case "list":
        return res.status(200).json({ cloud: true, stories: await listBooks() });
      case "save":
        if (!story || !safeId(story.id) || !Array.isArray(story.pages)) return res.status(400).json({ error: "bad_request", message: "That book is missing pieces." });
        if (JSON.stringify(story).length > MAX_BYTES) return res.status(413).json({ error: "too_big", message: "That book is too big to save." });
        return res.status(200).json({ cloud: true, story: await saveBook(story) });
      case "delete":
        if (!safeId(id)) return res.status(400).json({ error: "bad_request", message: "Unknown book." });
        await deleteBook(id);
        return res.status(200).json({ cloud: true });
      case "profile-get":
        return res.status(200).json({ cloud: true, profile: await getProfile() });
      case "profile-save":
        if (!profile || typeof profile !== "object") return res.status(400).json({ error: "bad_request", message: "Missing settings." });
        if (JSON.stringify(profile).length > MAX_BYTES) return res.status(413).json({ error: "too_big", message: "Those settings are too big to save." });
        return res.status(200).json({ cloud: true, profile: await saveProfile(profile) });
      case "inbox-list":
        return res.status(200).json({ cloud: true, items: await listInbox() });
      case "inbox-delete":
        if (!safeId(id)) return res.status(400).json({ error: "bad_request", message: "Unknown newsletter." });
        await deleteInboxItem(id);
        return res.status(200).json({ cloud: true });
      default:
        return res.status(400).json({ error: "bad_request", message: "Unknown action." });
    }
  } catch (e) {
    fail(res, { status: 502, code: "storage_error", message: `Couldn't reach cloud storage: ${e.message}` });
  }
}
