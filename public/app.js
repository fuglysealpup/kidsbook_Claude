(() => {
const $ = (id) => document.getElementById(id);
const BGS = ["sky", "meadow", "sunset", "night", "sea", "sand", "blossom"];
const DEFAULTS = { name: "", age: "3", interests: "", include: "", exclude: "", phonetic: "pinyin", length: "8", pictures: "on", passcode: "" };
const DRAW_AT_ONCE = 3;

const SAMPLE = {
  id: "sample", sample: true, createdAt: "2026-10-05T00:00:00Z",
  title: "小兔子買水果", titlePhon: "xiǎo tù zi mǎi shuǐ guǒ", titleEn: "Little Bunny Buys Fruit",
  cover: "🐰", bg: "meadow", phonetic: "pinyin",
  pages: [
    { zh: "早安！小兔子去市場買水果。", phon: "zǎo ān xiǎo tù zi qù shì chǎng mǎi shuǐ guǒ", en: "Good morning! Little Bunny goes to the market to buy fruit.", scene: ["🐰", "🧺", "☀️"], bg: "sky" },
    { zh: "這是什麼？是紅色的蘋果！", phon: "zhè shì shén me shì hóng sè de píng guǒ", en: "What is this? It's a red apple!", scene: ["🍎", "🐰"], bg: "blossom" },
    { zh: "黃黃的香蕉，彎彎的，像月亮。", phon: "huáng huáng de xiāng jiāo wān wān de xiàng yuè liàng", en: "A yellow banana, curvy like the moon.", scene: ["🍌", "🌙"], bg: "sand" },
    { zh: "綠色的西瓜，好大好大！", phon: "lǜ sè de xī guā hǎo dà hǎo dà", en: "The green watermelon is so very big!", scene: ["🍉", "🐰", "😮"], bg: "meadow" },
    { zh: "小兔子說：「謝謝！」", phon: "xiǎo tù zi shuō xiè xie", en: "Little Bunny says, \"Thank you!\"", scene: ["🐰", "💬", "🧑‍🌾"], bg: "sunset" },
    { zh: "回家吃水果，好好吃！", phon: "huí jiā chī shuǐ guǒ hǎo hǎo chī", en: "Home to eat the fruit. Yummy!", scene: ["🏠", "🍎", "🍌", "🍉"], bg: "sky" }
  ],
  words: [
    { zh: "紅色", phon: "hóng sè", en: "red", emoji: "🔴" },
    { zh: "黃色", phon: "huáng sè", en: "yellow", emoji: "🟡" },
    { zh: "綠色", phon: "lǜ sè", en: "green", emoji: "🟢" },
    { zh: "蘋果", phon: "píng guǒ", en: "apple", emoji: "🍎" },
    { zh: "香蕉", phon: "xiāng jiāo", en: "banana", emoji: "🍌" },
    { zh: "西瓜", phon: "xī guā", en: "watermelon", emoji: "🍉" },
    { zh: "謝謝", phon: "xiè xie", en: "thank you", emoji: "🙏" }
  ]
};

/* ---------- storage: settings in localStorage, stories (with pictures) in IndexedDB ---------- */
const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("story-week", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("stories", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction("stories", mode), st = t.objectStore("stories");
      const out = fn(st);
      t.oncomplete = () => res(out?.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    all: () => tx("readonly", (s) => s.getAll()).then((a) => (a || []).sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""))),
    put: (story) => tx("readwrite", (s) => s.put(story)),
    del: (id) => tx("readwrite", (s) => s.delete(id))
  };
})();

let settings = { ...DEFAULTS, ...local.get("sw-settings", {}) };
let stories = [];
let images = [];        // newsletter pages as pictures, when the PDF has no readable text
let busy = false;
const drawing = new Set();   // "storyId:index" currently being drawn (index 0 = cover)

/* ---------- server calls ---------- */
async function api(path, body) {
  let r;
  try {
    r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-passcode": settings.passcode || "" }, body: JSON.stringify(body) });
  } catch {
    throw { code: "offline", message: "Couldn't reach the server. Check your connection and try again." };
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw { status: r.status, code: data.error, message: data.message };
  return data;
}
function errorCopy(e) {
  if (e?.status === 401) return "Enter the app passcode under About your child, then try again.";
  if (e?.code === "no_key") return "The server is missing its OpenAI key. Add OPENAI_API_KEY in your hosting settings.";
  if (e?.status === 429) return "OpenAI says to slow down, or the account is out of credit. Try again in a bit.";
  if (e?.status === 504) return "OpenAI took too long. Try again.";
  return e?.message || "Something went wrong. Try again.";
}

/* ---------- settings form ---------- */
function readForm() {
  return {
    name: $("s-name").value.trim(), age: $("s-age").value, interests: $("s-interests").value.trim(),
    include: $("s-include").value.trim(), exclude: $("s-exclude").value.trim(),
    phonetic: document.querySelector('input[name="phon"]:checked').value, length: $("s-length").value,
    pictures: $("s-pictures").value, passcode: $("s-passcode").value.trim()
  };
}
function fillForm(s) {
  $("s-name").value = s.name; $("s-age").value = s.age; $("s-interests").value = s.interests;
  $("s-include").value = s.include; $("s-exclude").value = s.exclude; $("s-length").value = s.length;
  $("s-pictures").value = s.pictures; $("s-passcode").value = s.passcode;
  $(s.phonetic === "zhuyin" ? "phon-zhuyin" : "phon-pinyin").checked = true;
  renderSummary();
}
function renderSummary() {
  const s = settings, bits = [];
  bits.push(s.name ? `Starring ${s.name}` : "No name set");
  bits.push(`age ${s.age}`);
  if (s.interests) bits.push(`loves ${s.interests}`);
  bits.push(s.phonetic === "zhuyin" ? "注音" : "pinyin");
  bits.push(`${s.length} pages`);
  bits.push(s.pictures === "on" ? "with pictures" : "emoji only");
  $("settings-summary").textContent = bits.join(" · ") + ". Change these under About your child.";
}
$("save-settings").addEventListener("click", () => {
  settings = readForm(); local.set("sw-settings", settings); renderSummary();
  $("settings-status").textContent = "Saved";
  setTimeout(() => { $("settings-status").textContent = ""; }, 2000);
});

/* ---------- lesson input ---------- */
const drop = $("drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });
$("lesson-file").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; });
$("lesson-text").addEventListener("input", updateGenerate);

function note(html) { const n = $("file-note"); n.hidden = !html; n.innerHTML = html || ""; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
async function handleFile(file) {
  images = []; setStatus("");
  if (file.type.startsWith("image/")) {
    try { images = [await shrinkImage(file)]; } catch { setStatus("Couldn't open that picture. Try a PDF or paste the text.", true); return; }
    note(`<strong>${esc(file.name)}</strong> added as a picture. The story will be written from what's in it.`);
    updateGenerate(); return;
  }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { setStatus("That file isn't a PDF or picture. Try the newsletter PDF.", true); return; }
  if (!window.pdfjsLib) { setStatus("The PDF reader didn't load. Paste the newsletter text instead.", true); return; }
  note(`Reading <strong>${esc(file.name)}</strong>…`);
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      let line = "", lastY = null;
      for (const it of tc.items) {
        const y = it.transform ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) { text += line.trim() + "\n"; line = ""; }
        line += it.str + (it.hasEOL ? "\n" : " "); lastY = y;
      }
      text += line.trim() + "\n\n";
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.replace(/\s/g, "").length > 120) {
      $("lesson-text").value = text;
      note(`<strong>${esc(file.name)}</strong> · ${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""} read. Trim the text below if it has things unrelated to the lesson.`);
    } else {
      for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) images.push(await pageToJpeg(await pdf.getPage(i)));
      note(`<strong>${esc(file.name)}</strong> is mostly pictures, so ${images.length} page${images.length > 1 ? "s" : ""} will be read as images.`);
    }
  } catch {
    note(""); setStatus("Couldn't read that PDF. Paste the newsletter text instead.", true);
  }
  updateGenerate();
}
async function pageToJpeg(page) {
  const vp = page.getViewport({ scale: 1.4 });
  const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return c.toDataURL("image/jpeg", 0.8);
}

/* ---------- generation ---------- */
function setStatus(t, err) { const s = $("status"); s.textContent = t; s.classList.toggle("err", !!err); }
function setProgress(frac) { const p = $("progress"); p.hidden = frac == null; if (frac != null) p.firstElementChild.style.width = Math.round(frac * 100) + "%"; }
function updateGenerate() {
  const has = $("lesson-text").value.trim().length > 20 || images.length > 0;
  $("generate").disabled = !has || busy;
}

$("generate").addEventListener("click", async () => {
  settings = readForm(); local.set("sw-settings", settings); renderSummary();
  busy = true; updateGenerate();
  setStatus("Writing the story… this takes about half a minute."); setProgress(0.05);
  let story;
  try {
    const { story: s } = await api("/api/story", { settings, lesson: $("lesson-text").value.trim(), images });
    story = { ...s, id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
    stories.unshift(story);
    await idb.put(story).catch(() => {});
    renderShelf(); openBook(story);
  } catch (e) {
    setStatus(errorCopy(e), true); setProgress(null);
    busy = false; updateGenerate(); return;
  }
  if (settings.pictures === "on") {
    await drawAll(story);
  } else {
    setStatus("Done! Your story is on the bookshelf."); setProgress(null);
  }
  busy = false; updateGenerate();
});

function sceneFor(story, idx) {
  if (idx === 0) return story.coverIllustration || `Cover picture for a children's book titled "${story.titleEn}".`;
  const p = story.pages[idx - 1];
  return p.illustration || p.en;
}
async function drawOne(story, idx) {
  const key = `${story.id}:${idx}`;
  if (drawing.has(key)) return true;
  drawing.add(key); refreshReader(story, idx);
  try {
    const { image } = await api("/api/image", { scene: sceneFor(story, idx), style: story.style, characters: story.characters });
    if (idx === 0) story.coverImage = image; else story.pages[idx - 1].image = image;
    await idb.put(story).catch(() => {});
    return true;
  } catch (e) {
    story._lastError = e;
    return false;
  } finally {
    drawing.delete(key); refreshReader(story, idx);
    if (idx === 0) renderShelf();
  }
}
async function drawAll(story) {
  const todo = [0, ...story.pages.map((_, i) => i + 1)].filter((i) => !(i === 0 ? story.coverImage : story.pages[i - 1].image));
  let done = 0, failed = 0;
  const total = todo.length;
  const tick = () => {
    setStatus(`Drawing pictures… ${done} of ${total} done. You can start reading while they finish.`);
    setProgress(0.1 + 0.9 * (done / total));
  };
  tick();
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      if (!(await drawOne(story, i))) failed++;
      done++; tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(DRAW_AT_ONCE, total) }, worker));
  setProgress(null);
  if (failed) setStatus(`${failed} picture${failed > 1 ? "s" : ""} didn't come out (${errorCopy(story._lastError)}). Open the book and tap 🎨 on a page to try again.`, true);
  else setStatus("Done! All the pictures are in.");
}

/* ---------- bookshelf ---------- */
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } }
function renderShelf() {
  const shelf = $("shelf"); shelf.textContent = "";
  for (const st of [...stories, SAMPLE]) {
    const wrap = document.createElement("div"); wrap.className = "book-wrap";
    const b = document.createElement("button"); b.type = "button"; b.className = "book";
    b.setAttribute("aria-label", `Open ${st.titleEn || st.title}`);
    const cover = document.createElement("div"); cover.className = "cover bg-" + (st.bg || "sky");
    if (st.coverImage) { cover.classList.add("has-img"); const img = new Image(); img.src = st.coverImage; img.alt = ""; cover.append(img); }
    else cover.textContent = st.cover || "📖";
    const meta = document.createElement("div"); meta.className = "meta";
    const t = document.createElement("div"); t.className = "t"; t.lang = "zh-Hant"; t.textContent = st.title;
    const te = document.createElement("div"); te.className = "te"; te.textContent = st.titleEn;
    const d = document.createElement("div"); d.className = "d"; d.textContent = st.sample ? "Example story" : fmtDate(st.createdAt);
    meta.append(t, te, d); b.append(cover, meta);
    if (st.sample) { const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = "Example"; b.append(tag); }
    b.addEventListener("click", () => openBook(st));
    wrap.append(b);
    if (!st.sample) {
      const del = document.createElement("button"); del.type = "button"; del.className = "ghost del"; del.textContent = "Delete";
      let armed = null;
      del.addEventListener("click", async () => {
        if (!armed) { del.textContent = "Tap again to delete"; del.classList.add("danger"); armed = setTimeout(() => { armed = null; del.textContent = "Delete"; del.classList.remove("danger"); }, 3000); return; }
        clearTimeout(armed);
        try { await idb.del(st.id); stories = stories.filter((x) => x.id !== st.id); renderShelf(); }
        catch { del.textContent = "Couldn't delete"; }
      });
      wrap.append(del);
    }
    shelf.append(wrap);
  }
  $("shelf-count").textContent = stories.length ? `${stories.length} stor${stories.length === 1 ? "y" : "ies"}` : "";
  $("shelf-note").textContent = stories.length ? "" : "Your stories will land here. Open the example to see how a book reads.";
}

/* ---------- reader ---------- */
const reader = { story: null, i: 0, phon: true, en: true };
{ const r = local.get("sw-reader", {}); if (typeof r.phon === "boolean") reader.phon = r.phon; if (typeof r.en === "boolean") reader.en = r.en; }

const HAN = /\p{Script=Han}/u;
function rubyLine(zh, phon, cls) {
  const el = document.createElement("div"); el.className = cls; el.lang = "zh-Hant";
  const syl = (phon || "").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{M}ˊˇˋ˙]/gu, "")).filter(Boolean);
  const hanCount = [...zh].filter((c) => HAN.test(c)).length;
  if (syl.length && syl.length === hanCount) {
    let k = 0;
    for (const ch of zh) {
      if (HAN.test(ch)) {
        const r = document.createElement("ruby"); r.append(ch);
        const rt = document.createElement("rt"); rt.textContent = syl[k++]; r.append(rt); el.append(r);
      } else el.append(ch);
    }
    return [el];
  }
  el.textContent = zh;
  if (!phon) return [el];
  const p = document.createElement("div"); p.className = "phon-line"; p.textContent = phon;
  return [el, p];
}
const pageCount = (st) => 1 + st.pages.length + (st.words?.length ? 1 : 0);
function sceneEl(emoji, bg, image, isDrawing) {
  const s = document.createElement("div"); s.className = "scene bg-" + (bg || "sky");
  if (image) { s.classList.add("has-img"); const img = new Image(); img.src = image; img.alt = ""; s.append(img); }
  else for (const e of emoji) { const sp = document.createElement("span"); sp.textContent = e; s.append(sp); }
  if (isDrawing) { const d = document.createElement("div"); d.className = "drawing"; d.textContent = "Drawing…"; s.append(d); }
  return s;
}
function renderPage(dir) {
  const st = reader.story, i = reader.i, stage = $("stage");
  stage.textContent = "";
  const page = document.createElement("div");
  page.className = "page" + (reader.phon ? "" : " hide-phon") + (reader.en ? "" : " hide-en") + (dir ? " turn-" + dir : "");
  const words = document.createElement("div"); words.className = "words";
  const isDrawing = drawing.has(`${st.id}:${i}`);
  if (i === 0) {
    page.append(sceneEl([st.cover || "📖"], st.bg, st.coverImage, isDrawing));
    words.append(...rubyLine(st.title, st.titlePhon, "zh-line cover-title"));
    const en = document.createElement("div"); en.className = "en-line"; en.textContent = st.titleEn;
    const sub = document.createElement("div"); sub.className = "cover-sub"; sub.textContent = settings.name ? `A story for ${settings.name}` : "Tap or swipe to start";
    words.append(en, sub); page.append(words);
  } else if (i <= st.pages.length) {
    const p = st.pages[i - 1];
    page.append(sceneEl(p.scene?.length ? p.scene : ["📖"], p.bg, p.image, isDrawing));
    words.append(...rubyLine(p.zh, p.phon, "zh-line"));
    const en = document.createElement("div"); en.className = "en-line"; en.textContent = p.en; words.append(en);
    page.append(words);
  } else {
    const head = document.createElement("div"); head.className = "words-head";
    const h = document.createElement("h3"); h.textContent = "這週的詞語"; h.lang = "zh-Hant";
    const e = document.createElement("div"); e.className = "en-line"; e.textContent = "Words from this week";
    head.append(h, e);
    const g = document.createElement("div"); g.className = "wordgrid";
    for (const w of st.words) {
      const c = document.createElement("button"); c.type = "button"; c.className = "wcard"; c.setAttribute("aria-label", `Say ${w.en}`);
      const em = document.createElement("div"); em.className = "e"; em.textContent = w.emoji || "⭐";
      const [z] = rubyLine(w.zh, w.phon, "z");
      const en = document.createElement("div"); en.className = "en en-line"; en.style.fontStyle = "normal"; en.textContent = w.en;
      c.append(em, z, en); c.addEventListener("click", (ev) => { ev.stopPropagation(); say(w.zh); }); g.append(c);
    }
    page.append(head, g);
  }
  stage.append(page);
  const n = pageCount(st), dots = $("dots"); dots.textContent = "";
  for (let k = 0; k < n; k++) { const d = document.createElement("i"); if (k === i) d.className = "on"; dots.append(d); }
  $("r-prev").disabled = i === 0; $("r-next").textContent = i === n - 1 ? "The end ✓" : "Next ›";
  $("r-phon").textContent = st.phonetic === "zhuyin" ? "注音" : "拼音";
  $("r-phon").setAttribute("aria-pressed", reader.phon); $("r-en").setAttribute("aria-pressed", reader.en);
  $("r-redraw").hidden = !!st.sample || i > st.pages.length;
  $("r-redraw").disabled = isDrawing;
}
function refreshReader(story, idx) {
  if (!$("reader").hidden && reader.story === story && reader.i === idx) renderPage();
}
function go(d) {
  const n = pageCount(reader.story), j = reader.i + d;
  if (j < 0) return; if (j >= n) { closeBook(); return; }
  reader.i = j; stopSpeech(); renderPage(d > 0 ? "next" : "prev");
}
let lastFocus = null;
function openBook(st) {
  reader.story = st; reader.i = 0; lastFocus = document.activeElement;
  $("r-title").textContent = st.title; $("reader").hidden = false; document.body.style.overflow = "hidden";
  renderPage(); $("r-next").focus();
}
function closeBook() { stopSpeech(); $("reader").hidden = true; document.body.style.overflow = ""; lastFocus?.focus?.(); }
$("r-close").addEventListener("click", closeBook);
$("r-prev").addEventListener("click", () => go(-1));
$("r-next").addEventListener("click", () => go(1));
const saveReader = () => local.set("sw-reader", { phon: reader.phon, en: reader.en });
$("r-phon").addEventListener("click", () => { reader.phon = !reader.phon; saveReader(); renderPage(); });
$("r-en").addEventListener("click", () => { reader.en = !reader.en; saveReader(); renderPage(); });
$("r-redraw").addEventListener("click", async () => {
  const st = reader.story, i = reader.i;
  const ok = await drawOne(st, i);
  if (!ok) setStatus(`That picture didn't come out: ${errorCopy(st._lastError)}`, true);
});
document.addEventListener("keydown", (e) => {
  if ($("reader").hidden) return;
  if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") closeBook();
});
const stage = $("stage"); let sx = null, sy = null;
stage.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
stage.addEventListener("pointerup", (e) => {
  if (sx === null) return;
  const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
  if (e.target.closest("button")) return;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? 1 : -1); return; }
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { const r = stage.getBoundingClientRect(); go(e.clientX - r.left < r.width / 3 ? -1 : 1); }
});

/* read aloud with the device's Mandarin voice */
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
if (!canSpeak) $("r-say").hidden = true;
function zhVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /zh[-_]HK/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
}
function stopSpeech() { if (canSpeak) try { speechSynthesis.cancel(); } catch {} }
function say(text) {
  if (!canSpeak || !text) return;
  stopSpeech();
  const u = new SpeechSynthesisUtterance(text); u.lang = "zh-TW"; u.rate = 0.8;
  const v = zhVoice(); if (v) u.voice = v;
  try { speechSynthesis.speak(u); } catch {}
}
$("r-say").addEventListener("click", () => {
  const st = reader.story, i = reader.i;
  if (i === 0) say(st.title); else if (i <= st.pages.length) say(st.pages[i - 1].zh); else say(st.words.map((w) => w.zh).join("，"));
});

/* ---------- boot ---------- */
fillForm(settings); renderShelf(); updateGenerate();
if (!settings.interests && !settings.name) $("settings-details").open = true;
idb.all().then((all) => { stories = all; renderShelf(); }).catch(() => {});
})();
