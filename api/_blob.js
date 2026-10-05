import { put, list, del } from "@vercel/blob";

// Everything lives in a Vercel Blob store when one is connected. Older stores set BLOB_READ_WRITE_TOKEN;
// newer ones set BLOB_STORE_ID and sign in with the deployment's OIDC token, which @vercel/blob picks up itself.
//   books/<id>/story-<random>.json      the book
//   books/<id>/<page>-<random>.webp     one file per picture
//   profile/profile-<random>.json       the child's settings and hero
//   profile/hero-<random>.webp          the hero's character sheet
//   inbox/<id>/item-<random>.json       a forwarded newsletter
//   inbox/<id>/<name>-<random>.pdf      its attachments
// Every save writes a new file name, so a browser or CDN never serves an old copy.
export const cloudOn = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export const safeId = (id) => (/^[a-z0-9]{4,40}$/i.test(String(id || "")) ? String(id) : null);
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const putPublic = (path, body, contentType) => put(path, body, { access: "public", contentType, addRandomSuffix: true });

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

const getJson = async (url) => {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; }
};

// Latest JSON file per id under a prefix, e.g. books/<id>/story-*.json.
async function latestByGroup(prefix, re) {
  const latest = new Map();
  for (const b of await listAll(prefix)) {
    const m = b.pathname.match(re);
    if (!m) continue;
    const prev = latest.get(m[1]);
    if (!prev || new Date(b.uploadedAt) > new Date(prev.uploadedAt)) latest.set(m[1], b);
  }
  return latest;
}

// Write a new version of a JSON file, then remove the older versions.
async function replaceJson(prefix, path, data) {
  const old = (await listAll(prefix)).map((b) => b.url);
  const blob = await putPublic(path, JSON.stringify(data), "application/json");
  const stale = old.filter((u) => u !== blob.url);
  if (stale.length) await del(stale);
  return blob.url;
}

/* ---------- pictures ---------- */

export async function putPicture(prefix, name, bytes, contentType) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp";
  return (await putPublic(`${prefix}/${name}.${ext}`, bytes, contentType)).url;
}

async function moveDataUrl(prefix, name, value) {
  const m = /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(value || "");
  return m ? putPicture(prefix, name, Buffer.from(m[2], "base64"), m[1]) : value;
}

/* ---------- books ---------- */

export async function listBooks() {
  const latest = await latestByGroup("books/", /^books\/([^/]+)\/story-[^/]*\.json$/);
  const stories = await Promise.all([...latest.values()].map((b) => getJson(b.url)));
  return stories.filter(Boolean).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function saveBook(story) {
  const id = story.id, dir = `books/${id}`;
  // Pictures still embedded as data URLs (books made before cloud saving) move into their own files.
  story.coverImage = await moveDataUrl(dir, "0", story.coverImage);
  for (let i = 0; i < story.pages.length; i++) story.pages[i].image = await moveDataUrl(dir, String(i + 1), story.pages[i].image);
  if (story.hero?.sheet) story.hero.sheet = await moveDataUrl(dir, "hero", story.hero.sheet);
  await replaceJson(`${dir}/story-`, `${dir}/story.json`, story);
  return story;
}

export async function deleteBook(id) {
  const urls = (await listAll(`books/${id}/`)).map((b) => b.url);
  if (urls.length) await del(urls);
}

/* ---------- the child's profile ---------- */

export async function getProfile() {
  const latest = await latestByGroup("profile/", /^profile\/(profile)-[^/]*\.json$/);
  const b = latest.get("profile");
  return b ? getJson(b.url) : null;
}

export async function saveProfile(profile) {
  if (profile.hero?.sheet) profile.hero.sheet = await moveDataUrl("profile", "hero", profile.hero.sheet);
  await replaceJson("profile/profile-", "profile/profile.json", profile);
  return profile;
}

/* ---------- forwarded newsletters ---------- */

export async function addInboxItem(item, pdfs) {
  const id = newId(), dir = `inbox/${id}`;
  const saved = [];
  for (const p of pdfs) {
    const safeName = (p.name || "newsletter.pdf").replace(/[^\w.-]+/g, "_").replace(/\.pdf$/i, "").slice(0, 60) || "newsletter";
    const blob = await putPublic(`${dir}/${safeName}.pdf`, p.bytes, "application/pdf");
    saved.push({ name: p.name || "newsletter.pdf", url: blob.url, size: p.bytes.length });
  }
  const full = { ...item, id, pdfs: saved };
  await putPublic(`${dir}/item.json`, JSON.stringify(full), "application/json");
  return full;
}

export async function listInbox() {
  const latest = await latestByGroup("inbox/", /^inbox\/([^/]+)\/item-[^/]*\.json$/);
  const items = await Promise.all([...latest.values()].map((b) => getJson(b.url)));
  return items.filter(Boolean).sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")));
}

export async function getInboxItem(id) {
  const latest = await latestByGroup(`inbox/${id}/`, /^inbox\/([^/]+)\/item-[^/]*\.json$/);
  const b = latest.get(id);
  return b ? getJson(b.url) : null;
}

export async function deleteInboxItem(id) {
  const urls = (await listAll(`inbox/${id}/`)).map((b) => b.url);
  if (urls.length) await del(urls);
}
