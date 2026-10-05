(() => {
const $ = (id) => document.getElementById(id);
const BGS = ["sky", "meadow", "sunset", "night", "sea", "sand", "blossom"];
const DEFAULT_PROFILE = {
  name: "", age: "3", interests: "", include: "", exclude: "", phonetic: "pinyin", length: "8", pictures: "on",
  boost: "0", style: "", hero: null, onboarded: false
};
const DRAW_AT_ONCE = 3;
// Mirrors LEVELS in api/_prompt.js: the child's age sets a starting level and "Story level" nudges it.
const LEVEL_NAMES = [null, "first words", "simple pattern", "little story", "growing story", "chatty story", "big-kid story", "early reader", "stretch"];
const LEVEL_SHAPE = [null, "a tiny repeating sentence per page", "one short sentence per page", "one or two sentences per page", "two or three sentences per page", "two to four sentences per page", "three to five sentences per page", "a short paragraph per page", "a full paragraph per page"];
const MAX_LEVEL = LEVEL_NAMES.length - 1;
const levelFor = (age, boost) => Math.min(MAX_LEVEL, Math.max(1, (Math.min(8, Math.max(2, Number(age) || 3)) - 1) + (Number(boost) || 0)));

const SAMPLE = {
  id: "sample", sample: true, status: "ready", createdAt: "2026-10-05T00:00:00Z",
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

/* ---------- storage on this device ---------- */
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
    all: () => tx("readonly", (s) => s.getAll()).then((a) => a || []),
    put: (story) => tx("readwrite", (s) => s.put(story)),
    del: (id) => tx("readwrite", (s) => s.delete(id))
  };
})();

/* ---------- state ---------- */
let config = { auth: "none", cloud: false };
let profile = { ...DEFAULT_PROFILE, ...local.get("sw-profile", local.get("sw-settings", {})) };
let passcode = local.get("sw-passcode", profile.passcode || "");
delete profile.passcode;
let stories = [];
let inbox = [];
let cloud = false;
const drawing = new Set();      // "storyId:index" being drawn now (index 0 = cover)
const lastError = new Map();
const saving = new Map();       // storyId -> { again } while a cloud save runs
const byNewest = (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""));

/* ---------- server ---------- */
async function api(path, body) {
  let r;
  try {
    r = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(config.auth === "passcode" ? { "x-passcode": passcode } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw { code: "offline", message: "Couldn't reach the server. Check your connection and try again." };
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = { status: r.status, code: data.error, message: data.message };
    if (r.status === 401 && (e.code === "signin" || e.code === "passcode")) showSignin(e.code === "passcode" ? "That passcode didn't work." : "Please sign in again.");
    throw e;
  }
  return data;
}
function errorCopy(e) {
  if (e?.code === "no_key") return "The server is missing its OpenAI key. Add OPENAI_API_KEY in Vercel.";
  if (e?.status === 429) return "OpenAI says to slow down, or the account is out of credit. Try again in a bit.";
  if (e?.status === 504) return "That took too long. Try again.";
  return e?.message || "Something went wrong. Try again.";
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(text, { action, onAction, ms = 4000, progress } = {}) {
  clearTimeout(toastTimer);
  $("toast").hidden = false; $("toast-text").textContent = text;
  const b = $("toast-btn"); b.hidden = !action; b.textContent = action || "";
  b.onclick = action ? () => { hideToast(); onAction?.(); } : null;
  $("toast-bar").hidden = progress == null;
  if (progress != null) $("toast-bar").firstElementChild.style.width = Math.round(progress * 100) + "%";
  if (ms) toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { clearTimeout(toastTimer); $("toast").hidden = true; }

/* ---------- screens ---------- */
function show(id) {
  for (const s of ["signin", "home"]) $(s).hidden = s !== id;
}
function openSheet(id) { $(id).hidden = false; document.body.style.overflow = "hidden"; $(id).scrollTop = 0; }
function closeSheet(id) { $(id).hidden = true; if ($("profile").hidden && $("maker").hidden && $("reader").hidden) document.body.style.overflow = ""; }

/* ---------- sign in ---------- */
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.append(s); });

async function signInWith(provider, token) {
  $("signin-status").classList.remove("err");
  $("signin-status").textContent = "Signing in…";
  try {
    const r = await api("/api/session", { provider, token });
    config.signedIn = true; config.email = r.email;
    $("signin-status").textContent = "";
    await start();
  } catch (e) {
    $("signin-status").textContent = errorCopy(e); $("signin-status").classList.add("err");
  }
}
function showSignin(message) {
  show("signin");
  for (const id of ["profile", "maker"]) $(id).hidden = true;
  $("reader").hidden = true;
  $("signin-status").textContent = message || "";
  if (config.auth === "passcode") {
    $("signin-lede").textContent = "Enter the passcode you set when hosting the app.";
    $("passcode-box").hidden = false; $("passcode-in").value = passcode;
    $("google-btn").hidden = true; $("apple-btn").hidden = true;
    return;
  }
  $("passcode-box").hidden = true;
  if (config.googleClientId) {
    loadScript("https://accounts.google.com/gsi/client").then(() => {
      google.accounts.id.initialize({ client_id: config.googleClientId, callback: (r) => signInWith("google", r.credential) });
      $("google-btn").textContent = "";
      google.accounts.id.renderButton($("google-btn"), { theme: "outline", size: "large", shape: "pill", text: "signin_with", width: 240 });
    }).catch(() => { $("signin-status").textContent = "Google sign-in didn't load. Check your connection."; });
  }
  if (config.appleServiceId) {
    $("apple-btn").hidden = false;
    $("apple-btn").onclick = async () => {
      try {
        if (!window.AppleID) await loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");
        AppleID.auth.init({ clientId: config.appleServiceId, scope: "email", redirectURI: location.origin + "/", usePopup: true });
        const r = await AppleID.auth.signIn();
        await signInWith("apple", r?.authorization?.id_token);
      } catch (e) {
        if (e?.error !== "popup_closed_by_user") $("signin-status").textContent = "Apple sign-in didn't finish. Try again.";
      }
    };
  }
}
$("passcode-go").addEventListener("click", async () => {
  passcode = $("passcode-in").value.trim(); local.set("sw-passcode", passcode);
  $("signin-status").textContent = "Checking…";
  try { await api("/api/books", { action: "list" }); $("signin-status").textContent = ""; await start(); }
  catch (e) { if (e?.status !== 401) $("signin-status").textContent = errorCopy(e); }
});
$("signout").addEventListener("click", async () => {
  try { await api("/api/session", { action: "signout" }); } catch {}
  config.signedIn = false; closeSheet("profile"); showSignin("Signed out.");
});

/* ---------- profile (settings + hero) ---------- */
let setupStep = 0;   // 0 = editing everything at once; 1..4 = first-time setup step
const SETUP_STEPS = 4;
let heroPhoto = null;

function fillProfileForm() {
  const p = profile;
  $("s-name").value = p.name; $("s-age").value = p.age; $("s-interests").value = p.interests;
  $("s-include").value = p.include; $("s-exclude").value = p.exclude; $("s-length").value = p.length;
  $("s-pictures").value = p.pictures; $("s-style").value = p.style || "";
  $("s-hero").value = p.hero?.description || p.heroDraft || "";
  ($("phon-" + p.phonetic) || $("phon-pinyin")).checked = true;
  renderHeroSheet();
  renderForwardInfo();
  $("account-line").textContent = config.auth === "login" ? `Signed in as ${config.email || "you"}.` : config.auth === "passcode" ? "Using the app passcode." : "This copy of the app has no sign-in.";
  $("signout").hidden = config.auth !== "login";
}
function readProfileForm() {
  return {
    ...profile,
    name: $("s-name").value.trim(), age: $("s-age").value, interests: $("s-interests").value.trim(),
    include: $("s-include").value.trim(), exclude: $("s-exclude").value.trim(), length: $("s-length").value,
    pictures: $("s-pictures").value, style: $("s-style").value,
    phonetic: document.querySelector('input[name="phon"]:checked').value,
    heroDraft: $("s-hero").value.trim()
  };
}
function renderHeroSheet() {
  const box = $("hero-sheet"); box.textContent = "";
  if (profile.hero?.sheet) { const img = new Image(); img.src = profile.hero.sheet; img.alt = `${profile.name || "Your hero"} as a picture-book character`; box.append(img); }
  else { const s = document.createElement("span"); s.textContent = "No hero drawn yet"; box.append(s); }
  $("hero-go").textContent = profile.hero?.sheet ? "Draw again" : "Draw my hero";
}
function renderForwardInfo() {
  const box = $("forward-info"); box.textContent = "";
  const p = (t) => { const el = document.createElement("p"); el.className = "lede"; el.textContent = t; box.append(el); return el; };
  if (config.inboundAddress) {
    p("Forward the class newsletter email to this address from the email you sign in with. It shows up here, ready to turn into a story:");
    const row = document.createElement("div"); row.className = "row";
    const code = document.createElement("strong"); code.textContent = config.inboundAddress; code.style.wordBreak = "break-all";
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "ghost"; copy.textContent = "Copy";
    copy.onclick = async () => { try { await navigator.clipboard.writeText(config.inboundAddress); copy.textContent = "Copied"; } catch { copy.textContent = "Select and copy it"; } };
    row.append(code, copy); box.append(row);
    p("Tip: set up an auto-forward rule in your email so it happens every week by itself.").className = "hint";
  } else {
    p("Each week, tap Make this week's story and add the newsletter PDF. Email forwarding can be switched on later (see the README).");
  }
}
function profileMode(step) {
  setupStep = step;
  const sections = [...$("profile").querySelectorAll("[data-step]")];
  for (const s of sections) s.hidden = step ? Number(s.dataset.step) !== step : false;
  for (const el of $("profile").querySelectorAll("[data-edit-only]")) el.hidden = !!step;
  for (const el of $("profile").querySelectorAll("[data-setup-only]")) el.hidden = !step;
  $("profile-steps").hidden = !step;
  if (step) {
    $("profile-steps").innerHTML = Array.from({ length: SETUP_STEPS }, (_, i) => `<i class="${i < step ? "on" : ""}"></i>`).join("");
    $("profile-h").textContent = "Welcome";
    $("profile-back").hidden = step === 1;
    $("profile-save").textContent = step === SETUP_STEPS ? "Done" : step === 2 && !profile.hero?.sheet ? "Skip for now" : "Next";
    $("profile-close").hidden = true;
  } else {
    $("profile-h").textContent = "Your child";
    $("profile-back").hidden = true; $("profile-save").textContent = "Save"; $("profile-close").hidden = false;
  }
}
async function saveProfile(next) {
  profile = next;
  const { heroDraft, ...rest } = profile;
  local.set("sw-profile", { ...rest, heroDraft });
  renderChip();
  if (cloud) {
    try { const r = await api("/api/books", { action: "profile-save", profile: rest }); if (r.profile?.hero) profile.hero = r.profile.hero; local.set("sw-profile", { ...profile }); }
    catch (e) { toast(`Saved on this device, but not in the cloud: ${errorCopy(e)}`, { ms: 6000 }); }
  }
}
$("profile-chip").addEventListener("click", () => { fillProfileForm(); profileMode(0); openSheet("profile"); });
$("profile-close").addEventListener("click", () => closeSheet("profile"));
$("profile-back").addEventListener("click", () => { profile = readProfileForm(); profileMode(Math.max(1, setupStep - 1)); });
$("profile-save").addEventListener("click", async () => {
  const next = readProfileForm();
  if (setupStep && setupStep < SETUP_STEPS) { profile = next; profileMode(setupStep + 1); $("profile").scrollTop = 0; return; }
  if (setupStep === SETUP_STEPS) next.onboarded = true;
  $("profile-status").textContent = "Saving…";
  await saveProfile(next);
  $("profile-status").textContent = "";
  closeSheet("profile"); renderHome();
  if (setupStep === SETUP_STEPS) toast("All set. Make your first story whenever you're ready.");
  else toast("Saved");
});
$("s-photo").addEventListener("change", async (e) => {
  const f = e.target.files?.[0]; e.target.value = "";
  if (!f) return;
  try {
    heroPhoto = await shrinkImage(f, 1024);
    $("photo-thumb").src = heroPhoto; $("photo-thumb").hidden = false;
    $("hero-status").textContent = "Photo added. Tap Draw my hero.";
  } catch { $("hero-status").textContent = "Couldn't open that photo."; }
});
$("hero-go").addEventListener("click", async () => {
  const draft = readProfileForm();
  if (!draft.heroDraft && !heroPhoto) { $("hero-status").textContent = "Describe your hero or add a photo first."; return; }
  $("hero-go").disabled = true; $("hero-status").textContent = "Drawing your hero… this takes about a minute.";
  try {
    const { hero } = await api("/api/hero", { description: draft.heroDraft, photo: heroPhoto, style: draft.style, age: draft.age, name: draft.name });
    heroPhoto = null; $("photo-thumb").hidden = true;
    draft.hero = hero; draft.heroDraft = hero.description;
    await saveProfile(draft);
    $("s-hero").value = hero.description;
    renderHeroSheet(); $("hero-status").textContent = "Here's your hero. Every book will draw them like this.";
    if (setupStep === 2) $("profile-save").textContent = "Next";
  } catch (e) {
    $("hero-status").textContent = errorCopy(e);
  } finally {
    $("hero-go").disabled = false;
  }
});
function renderChip() {
  $("chip-name").textContent = profile.name || "Set up";
  const a = $("chip-avatar"); a.textContent = "";
  if (profile.hero?.sheet) { const img = new Image(); img.src = profile.hero.sheet; img.alt = ""; img.style.objectPosition = "16% 50%"; a.append(img); }
  else a.textContent = "🧒";
}

/* ---------- home ---------- */
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } }
function renderHome() {
  renderChip(); renderInbox(); renderShelf();
}
function renderInbox() {
  const box = $("inbox"); box.textContent = "";
  for (const item of inbox) {
    const card = document.createElement("section"); card.className = "news";
    const h = document.createElement("h2"); h.textContent = "This week's newsletter is here";
    const meta = document.createElement("p"); meta.className = "meta"; meta.textContent = `${item.subject} · ${fmtDate(item.receivedAt)}`;
    card.append(h, meta);
    if (item.pdfs?.length) {
      const clip = document.createElement("div"); clip.className = "clip";
      for (const p of item.pdfs) { const s = document.createElement("span"); s.textContent = "📎 " + p.name; clip.append(s); }
      card.append(clip);
    }
    const row = document.createElement("div"); row.className = "row";
    const go = document.createElement("button"); go.type = "button"; go.className = "primary"; go.textContent = "Make the story";
    go.onclick = () => openMaker({ inboxItem: item });
    const skip = document.createElement("button"); skip.type = "button"; skip.className = "ghost"; skip.textContent = "Dismiss";
    skip.onclick = () => {
      inbox = inbox.filter((x) => x.id !== item.id); renderInbox();
      let undone = false;
      toast("Newsletter dismissed.", { action: "Undo", onAction: () => { undone = true; inbox.unshift(item); renderInbox(); }, ms: 6000 });
      setTimeout(() => { if (!undone) api("/api/books", { action: "inbox-delete", id: item.id }).catch(() => {}); }, 6200);
    };
    row.append(go, skip); card.append(row); box.append(card);
  }
  $("make").querySelector(".big").textContent = inbox.length ? "Make a story from something else" : "Make this week's story";
  $("make").querySelector(".small").textContent = inbox.length ? "Add a PDF or paste the lesson text" : "From the class newsletter: add it, check the story, then pictures";
}
function renderShelf() {
  const shelf = $("shelf"); shelf.textContent = "";
  for (const st of [...stories, SAMPLE]) {
    const b = document.createElement("button"); b.type = "button"; b.className = "book";
    b.setAttribute("aria-label", `Open ${st.titleEn || st.title}`);
    const cover = document.createElement("div"); cover.className = "cover bg-" + (st.bg || "sky");
    if (st.coverImage) { cover.classList.add("has-img"); const img = new Image(); img.src = st.coverImage; img.alt = ""; img.loading = "lazy"; cover.append(img); }
    else cover.textContent = st.cover || "📖";
    const meta = document.createElement("div"); meta.className = "meta";
    const t = document.createElement("div"); t.className = "t"; t.lang = "zh-Hant"; t.textContent = st.title;
    const te = document.createElement("div"); te.className = "te"; te.textContent = st.titleEn;
    const d = document.createElement("div"); d.className = "d";
    d.textContent = st.sample ? "Example story" : fmtDate(st.createdAt) + (st.level ? ` · Level ${st.level}` : "");
    meta.append(t, te, d); b.append(cover, meta);
    const tagText = st.sample ? "Example" : st.status === "draft" ? "Draft" : "";
    if (tagText) { const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = tagText; b.append(tag); }
    b.addEventListener("click", () => (st.status === "draft" ? openReview(st) : openBook(st)));
    const wrap = document.createElement("div"); wrap.className = "book-wrap"; wrap.append(b);
    if (!st.sample) {
      const del = document.createElement("button"); del.type = "button"; del.className = "ghost del"; del.textContent = "Delete";
      del.addEventListener("click", () => removeBook(st));
      wrap.append(del);
    }
    shelf.append(wrap);
  }
  $("shelf-count").textContent = (stories.length ? `${stories.length} stor${stories.length === 1 ? "y" : "ies"} · ` : "") + (cloud ? "saved in the cloud" : "saved on this device");
  $("shelf-note").textContent = stories.length ? "" : "Your stories will land here. Open the example to see how a book reads.";
}
function removeBook(st) {
  stories = stories.filter((x) => x.id !== st.id); renderShelf();
  let undone = false;
  toast(`Deleted "${st.titleEn || st.title}".`, { action: "Undo", ms: 6000, onAction: () => { undone = true; stories.push(st); stories.sort(byNewest); renderShelf(); } });
  setTimeout(async () => {
    if (undone) return;
    try { if (cloud) await api("/api/books", { action: "delete", id: st.id }); await idb.del(st.id); }
    catch { stories.push(st); stories.sort(byNewest); renderShelf(); toast("Couldn't delete that book. Try again."); }
  }, 6200);
}
$("make").addEventListener("click", () => openMaker({}));

/* ---------- saving books: this device always, the cloud when connected ---------- */
async function keep(story) {
  await idb.put(story).catch(() => {});
  cloudSave(story);
}
function cloudSave(story) {
  if (!cloud || story.sample) return;
  const running = saving.get(story.id);
  if (running) { running.again = true; return; }
  const st = { again: false };
  saving.set(story.id, st);
  (async () => {
    do {
      st.again = false;
      try {
        const { story: saved } = await api("/api/books", { action: "save", story });
        if (saved) {
          // Pictures that were stored inside the book move to their own cloud files; use those links from now on.
          const adopt = (cur, s) => (/^data:/.test(cur || "") && /^https?:/.test(s || "") ? s : cur);
          story.coverImage = adopt(story.coverImage, saved.coverImage);
          story.pages.forEach((p, i) => { p.image = adopt(p.image, saved.pages?.[i]?.image); });
          if (story.hero) story.hero.sheet = adopt(story.hero.sheet, saved.hero?.sheet);
          await idb.put(story).catch(() => {});
        }
      } catch (e) {
        toast(`Saved on this device but not in the cloud yet: ${errorCopy(e)}`, { ms: 6000 });
        break;
      }
    } while (st.again);
    saving.delete(story.id);
  })();
}

/* ---------- make a story: newsletter step ---------- */
let maker = { inboxItem: null, images: [] };

function openMaker({ inboxItem }) {
  maker = { inboxItem: inboxItem || null, images: [] };
  $("step-lesson").hidden = false; $("step-review").hidden = true; setMakerStep(1);
  $("file-note").hidden = true; $("status").textContent = ""; $("status").classList.remove("err");
  $("week-include").value = "";
  ($("boost-" + String(profile.boost || "0").replace("-", "m")) || $("boost-0")).checked = true;
  const note = $("from-note"); note.textContent = "";
  if (inboxItem) {
    note.hidden = false;
    const s = document.createElement("strong"); s.textContent = inboxItem.subject;
    const m = document.createElement("span"); m.className = "hint";
    m.textContent = `Forwarded ${fmtDate(inboxItem.receivedAt)}` + (inboxItem.pdfs?.length ? ` · ${inboxItem.pdfs.map((p) => p.name).join(", ")} will be read too` : "");
    note.append(s, m);
    $("lesson-text").value = inboxItem.text || "";
    $("lesson-box").open = !inboxItem.pdfs?.length;
    $("drop").hidden = true;
  } else {
    note.hidden = true; $("drop").hidden = false; $("lesson-box").open = true;
    $("lesson-text").value = "";
  }
  renderSettingsSummary(); updateGenerate();
  openSheet("maker");
}
function setMakerStep(n) {
  $("maker-steps").innerHTML = `<span>1 Newsletter</span><i class="on"></i><i class="${n > 1 ? "on" : ""}"></i><span>2 Check</span>`;
}
$("maker-close").addEventListener("click", () => closeSheet("maker"));

function currentBoost() { return (document.querySelector('input[name="boost"]:checked') || {}).value || "0"; }
function renderSettingsSummary() {
  const s = profile, bits = [];
  bits.push(s.name ? `Starring ${s.name}` : "No name set");
  bits.push(`age ${s.age}`);
  if (s.interests) bits.push(`loves ${s.interests}`);
  bits.push({ zhuyin: "注音", none: "no sound guide" }[s.phonetic] || "pinyin");
  bits.push(`${s.length} pages`);
  bits.push(s.pictures === "on" ? (s.hero?.sheet ? "pictures with your hero" : "with pictures") : "emoji only");
  $("settings-summary").textContent = bits.join(" · ") + ". Change these from your child's profile.";
  const lv = levelFor(s.age, currentBoost());
  $("level-hint").textContent = `Level ${lv} of ${MAX_LEVEL}, ${LEVEL_NAMES[lv]}: ${LEVEL_SHAPE[lv]}.`;
}
document.querySelectorAll('input[name="boost"]').forEach((r) => r.addEventListener("change", () => {
  profile.boost = r.value; local.set("sw-profile", profile); renderSettingsSummary();
}));

const drop = $("drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f); });
$("lesson-file").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; });
$("lesson-text").addEventListener("input", updateGenerate);

function fileNote(html) { const n = $("file-note"); n.hidden = !html; n.innerHTML = html || ""; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
async function shrinkImage(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
async function handleFile(file) {
  maker.images = []; setStatus("");
  if (file.type.startsWith("image/")) {
    try { maker.images = [await shrinkImage(file)]; } catch { setStatus("Couldn't open that picture. Try a PDF or paste the text.", true); return; }
    fileNote(`<strong>${esc(file.name)}</strong> added as a picture. The story will be written from what's in it.`);
    updateGenerate(); return;
  }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { setStatus("That file isn't a PDF or picture. Try the newsletter PDF.", true); return; }
  if (!window.pdfjsLib) { setStatus("The PDF reader didn't load. Paste the newsletter text instead.", true); return; }
  fileNote(`Reading <strong>${esc(file.name)}</strong>…`);
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
      $("lesson-text").value = text; $("lesson-box").open = true;
      fileNote(`<strong>${esc(file.name)}</strong> · ${pdf.numPages} page${pdf.numPages > 1 ? "s" : ""} read. Trim the text if it has things unrelated to the lesson.`);
    } else {
      for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) maker.images.push(await pageToJpeg(await pdf.getPage(i)));
      fileNote(`<strong>${esc(file.name)}</strong> is mostly pictures, so ${maker.images.length} page${maker.images.length > 1 ? "s" : ""} will be read as images.`);
    }
  } catch {
    fileNote(""); setStatus("Couldn't read that PDF. Paste the newsletter text instead.", true);
  }
  updateGenerate();
}
async function pageToJpeg(page) {
  const vp = page.getViewport({ scale: 1.4 });
  const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return c.toDataURL("image/jpeg", 0.8);
}
function setStatus(t, err) { const s = $("status"); s.textContent = t; s.classList.toggle("err", !!err); }
let writing = false;
function updateGenerate() {
  const has = $("lesson-text").value.trim().length > 20 || maker.images.length > 0 || !!maker.inboxItem?.pdfs?.length;
  $("generate").disabled = !has || writing;
}
function settingsForThisWeek() {
  const extra = $("week-include").value.trim();
  const { heroDraft, onboarded, ...s } = profile;
  return { ...s, boost: currentBoost(), include: [s.include, extra].filter(Boolean).join("; ") };
}

$("generate").addEventListener("click", async () => {
  writing = true; updateGenerate();
  setStatus("Writing the story… this takes about half a minute.");
  try {
    const { story: s } = await api("/api/story", {
      settings: settingsForThisWeek(), lesson: $("lesson-text").value.trim(), images: maker.images, inboxId: maker.inboxItem?.id
    });
    const story = { ...s, id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), settings: settingsForThisWeek() };
    stories.unshift(story); renderShelf();
    await keep(story);
    if (maker.inboxItem) {
      const id = maker.inboxItem.id;
      inbox = inbox.filter((x) => x.id !== id); renderInbox();
      api("/api/books", { action: "inbox-delete", id }).catch(() => {});
    }
    setStatus("");
    openReview(story);
  } catch (e) {
    setStatus(errorCopy(e), true);
  } finally {
    writing = false; updateGenerate();
  }
});

/* ---------- make a story: review step ---------- */
let review = null;   // { story, original: [zh per page], enTouched: Set, asked: [] }

function openReview(story) {
  review = { story, original: story.pages.map((p) => p.zh), enTouched: new Set(), asked: [] };
  if ($("maker").hidden) openSheet("maker");
  $("from-note").hidden = true;
  $("step-lesson").hidden = true; $("step-review").hidden = false; setMakerStep(2);
  $("rv-status").textContent = ""; $("rv-ask").value = "";
  renderReview();
  $("maker").scrollTop = 0;
}
function renderReview() {
  const st = review.story;
  $("rv-title").textContent = st.title; $("rv-title-en").textContent = st.titleEn;
  const box = $("rv-pages"); box.textContent = "";
  st.pages.forEach((p, i) => {
    const card = document.createElement("div"); card.className = "rpage" + (p.zh !== review.original[i] ? " edited" : "");
    const num = document.createElement("div"); num.className = "num";
    const e = document.createElement("span"); e.className = "e"; e.textContent = p.scene?.[0] || "📖";
    const n = document.createElement("span"); n.textContent = `p. ${i + 1}`;
    num.append(e, n);
    const fields = document.createElement("div"); fields.className = "fields";
    const zh = document.createElement("textarea"); zh.className = "zh-in"; zh.lang = "zh-Hant"; zh.rows = 2; zh.value = p.zh;
    zh.setAttribute("aria-label", `Page ${i + 1} Chinese`);
    zh.addEventListener("input", () => { p.zh = zh.value; card.classList.toggle("edited", p.zh !== review.original[i]); phon.textContent = p.zh !== review.original[i] ? "Sound guide and English update when you continue." : p.phon; });
    const phon = document.createElement("p"); phon.className = "phon"; phon.textContent = p.phon;
    phon.hidden = st.phonetic === "none" && p.zh === review.original[i];
    const en = document.createElement("textarea"); en.rows = 2; en.value = p.en; en.setAttribute("aria-label", `Page ${i + 1} English`);
    en.addEventListener("input", () => { p.en = en.value; review.enTouched.add(i); });
    fields.append(zh, phon, en);
    card.append(num, fields); box.append(card);
  });
  const asked = $("rv-asked"); asked.textContent = "";
  for (const a of review.asked) { const s = document.createElement("span"); s.textContent = "✓ " + a; asked.append(s); }
}
function rvBusy(on, text) {
  for (const id of ["rv-ask-go", "rv-draw", "rv-save"]) $(id).disabled = on;
  $("rv-status").classList.remove("err"); $("rv-status").textContent = text || "";
}
// Refill sound guide, English and picture notes for pages whose Chinese was changed by hand.
async function settleEdits() {
  const st = review.story;
  const edited = st.pages.map((p, i) => (p.zh !== review.original[i] ? i : -1)).filter((i) => i >= 0);
  if (!edited.length) return;
  const { pages } = await api("/api/revise", { mode: "annotate", story: st, settings: st.settings || settingsForThisWeek(), pages: edited, keepEnglish: edited.filter((i) => review.enTouched.has(i)) });
  for (const f of pages) {
    const p = st.pages[f.i]; if (!p) continue;
    p.phon = f.phon;
    if (!review.enTouched.has(f.i) && f.en) p.en = f.en;
    if (f.illustration) p.illustration = f.illustration;
    p.hero = f.hero;
  }
  review.original = st.pages.map((p) => p.zh);
}
$("rv-ask-go").addEventListener("click", async () => {
  const ask = $("rv-ask").value.trim();
  if (!ask) { $("rv-status").textContent = "Type what you'd like changed first."; return; }
  rvBusy(true, "Rewriting… this takes about half a minute.");
  try {
    const st = review.story;
    const { story: updated } = await api("/api/revise", { mode: "chat", story: st, settings: st.settings || settingsForThisWeek(), instruction: ask });
    const keepKeys = { id: st.id, createdAt: st.createdAt, hero: st.hero, settings: st.settings, status: "draft" };
    Object.keys(st).forEach((k) => delete st[k]);
    Object.assign(st, updated, keepKeys);
    review.original = st.pages.map((p) => p.zh); review.enTouched.clear(); review.asked.push(ask);
    $("rv-ask").value = "";
    await keep(st); renderShelf(); renderReview();
    rvBusy(false, "Updated. Have a read.");
  } catch (e) {
    rvBusy(false); $("rv-status").textContent = errorCopy(e); $("rv-status").classList.add("err");
  }
});
$("rv-ask").addEventListener("keydown", (e) => { if (e.key === "Enter") $("rv-ask-go").click(); });
$("rv-save").addEventListener("click", async () => {
  rvBusy(true, "Saving…");
  try { await settleEdits(); await keep(review.story); renderShelf(); rvBusy(false); closeSheet("maker"); toast("Draft saved to your bookshelf."); }
  catch (e) { rvBusy(false); $("rv-status").textContent = errorCopy(e); $("rv-status").classList.add("err"); }
});
$("rv-draw").addEventListener("click", async () => {
  rvBusy(true, "Getting the pages ready…");
  try {
    await settleEdits();
    const st = review.story;
    st.status = "ready";
    await keep(st); renderShelf();
    rvBusy(false); closeSheet("maker");
    openBook(st);
    if ((st.settings?.pictures || profile.pictures) === "on") drawAll(st);
  } catch (e) {
    rvBusy(false); $("rv-status").textContent = errorCopy(e); $("rv-status").classList.add("err");
  }
});

/* ---------- pictures ---------- */
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
    const { image } = await api("/api/image", {
      scene: sceneFor(story, idx), style: story.style, characters: story.characters, age: story.age,
      bookId: story.id, idx, heroSheet: story.hero?.sheet, heroInScene: idx === 0 ? true : story.pages[idx - 1].hero !== false
    });
    if (idx === 0) story.coverImage = image; else story.pages[idx - 1].image = image;
    await keep(story);
    return true;
  } catch (e) {
    lastError.set(story.id, e);
    return false;
  } finally {
    drawing.delete(key); refreshReader(story, idx);
    if (idx === 0) renderShelf();
  }
}
async function drawAll(story) {
  const todo = [0, ...story.pages.map((_, i) => i + 1)].filter((i) => !(i === 0 ? story.coverImage : story.pages[i - 1].image));
  if (!todo.length) return;
  let done = 0, failed = 0;
  const total = todo.length;
  const tick = () => toast(`Drawing pictures: ${done} of ${total} done. Keep reading while they finish.`, { ms: 0, progress: done / total });
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
  if (failed) toast(`${failed} picture${failed > 1 ? "s" : ""} didn't come out (${errorCopy(lastError.get(story.id))}). Tap 🎨 on a page to try again.`, { ms: 9000 });
  else toast("All the pictures are in.");
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
    const name = st.settings?.name || profile.name;
    const sub = document.createElement("div"); sub.className = "cover-sub"; sub.textContent = name ? `A story for ${name}` : "Tap or swipe to start";
    words.append(en, sub); page.append(words);
  } else if (i <= st.pages.length) {
    const p = st.pages[i - 1];
    page.append(sceneEl(p.scene?.length ? p.scene : ["📖"], p.bg, p.image, isDrawing));
    words.append(...rubyLine(p.zh, p.phon, "zh-line"));
    const en = document.createElement("div"); en.className = "en-line"; en.textContent = p.en; words.append(en);
    page.append(words);
  } else {
    page.classList.add("words-page");
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
  $("r-phon").hidden = st.phonetic === "none";
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
  const st = reader.story;
  if (!(await drawOne(st, reader.i))) toast(`That picture didn't come out: ${errorCopy(lastError.get(st.id))}`, { ms: 7000 });
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

/* ---------- start up ---------- */
async function syncCloud() {
  let res;
  try { res = await api("/api/books", { action: "list" }); } catch { return; }
  if (!res.cloud) return;
  cloud = true;
  const [pr, ib] = await Promise.all([
    api("/api/books", { action: "profile-get" }).catch(() => null),
    api("/api/books", { action: "inbox-list" }).catch(() => null)
  ]);
  if (pr?.profile) { profile = { ...DEFAULT_PROFILE, ...profile, ...pr.profile }; local.set("sw-profile", profile); }
  else if (profile.onboarded) saveProfile(profile);           // first time on cloud: move this device's profile up
  inbox = ib?.items || [];
  const inCloud = new Map(res.stories.map((s) => [s.id, s]));
  const localOnly = stories.filter((s) => !inCloud.has(s.id));
  for (const s of res.stories) await idb.put(s).catch(() => {});
  stories = [...res.stories, ...localOnly].sort(byNewest);
  for (const s of localOnly) cloudSave(s);                     // books made before cloud saving move up
}

async function start() {
  show("home");
  renderHome();
  await syncCloud();
  renderHome();
  if (!profile.onboarded) { fillProfileForm(); profileMode(1); openSheet("profile"); }
}

(async () => {
  stories = (await idb.all().catch(() => [])).sort(byNewest);
  try { config = await api("/api/config"); }
  catch { config = { auth: "none", cloud: false }; }
  if (config.auth === "login" && !config.signedIn) return showSignin();
  if (config.auth === "passcode" && !passcode) return showSignin();
  await start();
})();
navigator.storage?.persist?.().catch(() => {});
})();
