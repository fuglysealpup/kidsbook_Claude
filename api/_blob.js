import { put, list, del } from "@vercel/blob";

// Books live in a Vercel Blob store when one is connected (BLOB_READ_WRITE_TOKEN is set).
// Layout: books/<id>/story-<random>.json for the story, books/<id>/<page>-<random>.webp per picture.
// Every save writes a new file name, so a browser or CDN never serves an old copy.
export const cloudOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const safeId = (id) => /^[a-z0-9]{4,40}$/i.test(String(id || "")) ? String(id) : null;

export async function putPicture(bookId, idx, bytes, contentType) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp";
  const blob = await put(`books/${bookId}/${idx}.${ext}`, bytes, { access: "public", contentType, addRandomSuffix: true });
  return blob.url;
}

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

export async function listBooks() {
  const latest = new Map();
  for (const b of await listAll("books/")) {
    const m = b.pathname.match(/^books\/([^/]+)\/story-[^/]*\.json$/);
    if (!m) continue;
    const prev = latest.get(m[1]);
    if (!prev || new Date(b.uploadedAt) > new Date(prev.uploadedAt)) latest.set(m[1], b);
  }
  const stories = await Promise.all([...latest.values()].map(async (b) => {
    try { const r = await fetch(b.url); return r.ok ? await r.json() : null; } catch { return null; }
  }));
  return stories.filter(Boolean).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveBook(story) {
  const id = story.id;
  // Pictures still embedded as data URLs (books made before cloud saving) move into their own files.
  const move = async (dataUrl, idx) => {
    const m = /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(dataUrl || "");
    return m ? putPicture(id, idx, Buffer.from(m[2], "base64"), m[1]) : dataUrl;
  };
  story.coverImage = await move(story.coverImage, 0);
  for (let i = 0; i < story.pages.length; i++) story.pages[i].image = await move(story.pages[i].image, i + 1);

  const old = (await listAll(`books/${id}/story-`)).map((b) => b.url);
  await put(`books/${id}/story.json`, JSON.stringify(story), { access: "public", contentType: "application/json", addRandomSuffix: true });
  if (old.length) await del(old);
  return story;
}

export async function deleteBook(id) {
  const urls = (await listAll(`books/${id}/`)).map((b) => b.url);
  if (urls.length) await del(urls);
}
