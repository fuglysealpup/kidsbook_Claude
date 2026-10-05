import { checkPasscode, requirePost, openai, fail } from "./_lib.js";

const MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const BGS = ["sky", "meadow", "sunset", "night", "sea", "sand", "blossom"];

// Story complexity grows step by step. Each child's age sets a starting level,
// and the "story level" control on the main page nudges it easier or harder.
export const LEVELS = [
  null,
  { name: "first words", length: "one tiny sentence per page, 3 to 7 Chinese characters", language: "the simplest everyday nouns and verbs; sound words (擬聲詞) and a repeating pattern on every page, like a chant", plot: "no real plot: the same pattern repeats with one thing changing each page" },
  { name: "simple pattern", length: "one short sentence per page, about 6 to 14 Chinese characters", language: "simple everyday words; a repeating phrase the child can say along with", plot: "a simple sequence (first, then, then) with a gentle ending" },
  { name: "little story", length: "one or two short sentences per page, about 12 to 22 Chinese characters", language: "simple words plus one or two new lesson words per page; a few short lines of dialogue; basic feeling words (開心, 難過)", plot: "a clear beginning, middle and end" },
  { name: "growing story", length: "two or three sentences per page, about 20 to 35 Chinese characters", language: "more describing words (colors, sizes, how things feel); dialogue between characters; feelings explained simply", plot: "a small problem the characters solve together" },
  { name: "chatty story", length: "two to four sentences per page, about 30 to 50 Chinese characters", language: "richer verbs and adjectives, connecting words like 因為, 所以, 可是; characters say why they do things", plot: "a problem, an attempt that doesn't work, then a solution" },
  { name: "big-kid story", length: "three to five sentences per page, about 45 to 70 Chinese characters", language: "varied sentence shapes, descriptive language, cause and effect; occasionally ask the reader a question", plot: "a multi-step plot with a small surprise and a satisfying ending" },
  { name: "early reader", length: "a short paragraph per page, about 60 to 90 Chinese characters", language: "rich vocabulary, an occasional easy 成語 explained by the story, characters with distinct ways of speaking", plot: "a fuller story with a clear lesson or change in a character" },
  { name: "stretch", length: "a full paragraph per page, about 80 to 120 Chinese characters", language: "expressive, varied vocabulary and longer sentences a confident early reader can follow", plot: "a layered story with feelings, choices and consequences" }
];
export const MAX_LEVEL = LEVELS.length - 1;

export function levelFor(age, boost) {
  const a = Math.min(8, Math.max(2, Number(age) || 3));
  const b = Math.min(3, Math.max(-2, Math.round(Number(boost) || 0)));
  return Math.min(MAX_LEVEL, Math.max(1, a - 1 + b));
}

function levelGuide(level) {
  const L = LEVELS[level];
  return `Level ${level} of ${MAX_LEVEL} (${L.name}).
- Page length: ${L.length}.
- Language: ${L.language}.
- Story shape: ${L.plot}.
- Stay at this level for the whole book. The English should match the Chinese in tone and length.`;
}

const clip = (v, n) => (typeof v === "string" ? v : "").slice(0, n);

export function buildPrompt(s, lesson, withImages) {
  const zhuyin = s.phonetic === "zhuyin";
  const pages = [6, 8, 10].includes(Number(s.length)) ? Number(s.length) : 8;
  const level = levelFor(s.age, s.boost);
  return `You write picture-book stories for a young child who attends a Mandarin-English bilingual preschool. Turn this week's classroom lesson into a short story the family can read together at home.

CHILD
- Name for the hero: ${clip(s.name, 60) || "(none given; use a friendly animal hero)"}
- Age: ${clip(String(s.age), 2) || "3"}
- Favorite things (weave one or two in): ${clip(s.interests, 300) || "(not given)"}
- Please include: ${clip(s.include, 300) || "(nothing specific)"}
- Please leave out: ${clip(s.exclude, 300) || "(nothing specific)"}

LANGUAGE
- All Chinese must be Traditional characters (繁體中文, as used in Taiwan). Never use Simplified characters.
- "phon" is the ${zhuyin ? "Zhuyin (注音符號) with tone marks" : "Hanyu Pinyin with tone marks, lowercase"} for the "zh" text: exactly one syllable per Chinese character, in order, separated by single spaces, with NO punctuation. Count carefully so the number of syllables equals the number of Chinese characters. Use neutral tones where natural (${zhuyin ? "子 ˙ㄗ, 謝謝 ㄒㄧㄝˋ ˙ㄒㄧㄝ" : "子 zi, 謝謝 xiè xie"}).
- "en" is a natural English translation of the page.

READING LEVEL
${levelGuide(level)}

STORY
- Exactly ${pages} story pages.
- Build the story around the lesson's key concepts and vocabulary (themes, words, songs, numbers, colors, values). Use each key word at least twice across the story.
- Warm and playful, with a clear little arc. End happily or calmly. Nothing scary.
- "characters": an English visual description of every recurring character (species or look, colors, clothing) so an illustrator draws them the same way on every page. If the hero is the child, describe a cheerful cartoon toddler without real-person details.
- "style": one line describing a consistent, gentle picture-book art style.
- Each page's "illustration": one or two English sentences describing what the picture shows. No text or signs in the picture.
- "scene" is 2 to 4 emoji for the page; put the main subject first. "bg" is one of: ${BGS.join(", ")}.
- "words" lists 4 to 8 key words from the lesson used in the story, each with one emoji.

Reply with only a JSON object in this shape:
{"title":"小兔子買水果","titlePhon":"${zhuyin ? "ㄒㄧㄠˇ ㄊㄨˋ ˙ㄗ ㄇㄞˇ ㄕㄨㄟˇ ㄍㄨㄛˇ" : "xiǎo tù zi mǎi shuǐ guǒ"}","titleEn":"Little Bunny Buys Fruit","cover":"🐰","coverIllustration":"…","bg":"meadow","style":"…","characters":"…","pages":[{"zh":"…","phon":"…","en":"…","illustration":"…","scene":["🍎","🐰"],"bg":"sky"}],"words":[{"zh":"蘋果","phon":"${zhuyin ? "ㄆㄧㄥˊ ㄍㄨㄛˇ" : "píng guǒ"}","en":"apple","emoji":"🍎"}]}

LESSON
${withImages ? "The attached images are pages of the school's weekly newsletter. " : ""}This comes from the school's weekly newsletter. It may be in English, Chinese or both. Ignore admin notices such as dates, fees, events and reminders, and focus on what the children learned.
"""
${clip(lesson, 14000) || "(see the attached images)"}
"""`;
}

export function clean(story) {
  if (!story || !Array.isArray(story.pages) || !story.pages.length) {
    throw Object.assign(new Error("The story came back incomplete. Try again."), { status: 502, code: "bad_shape" });
  }
  const str = (v) => (typeof v === "string" ? v : "");
  const bg = (v) => (BGS.includes(v) ? v : BGS[Math.floor(Math.random() * BGS.length)]);
  return {
    title: str(story.title) || "這週的故事", titlePhon: str(story.titlePhon), titleEn: str(story.titleEn) || "This week's story",
    cover: str(story.cover) || "📖", coverIllustration: str(story.coverIllustration), bg: bg(story.bg),
    style: str(story.style), characters: str(story.characters),
    pages: story.pages.filter((p) => p && str(p.zh)).slice(0, 14).map((p) => ({
      zh: str(p.zh), phon: str(p.phon), en: str(p.en), illustration: str(p.illustration),
      scene: (Array.isArray(p.scene) ? p.scene : []).map(str).filter(Boolean).slice(0, 4), bg: bg(p.bg)
    })),
    words: (Array.isArray(story.words) ? story.words : []).filter((w) => w && str(w.zh)).slice(0, 10)
      .map((w) => ({ zh: str(w.zh), phon: str(w.phon), en: str(w.en), emoji: str(w.emoji) }))
  };
}

export default async function handler(req, res) {
  if (!requirePost(req, res) || !checkPasscode(req, res)) return;
  const { settings = {}, lesson = "", images = [] } = req.body || {};
  const pics = (Array.isArray(images) ? images : []).filter((u) => typeof u === "string" && u.startsWith("data:image/")).slice(0, 4);
  if (String(lesson).trim().length < 20 && !pics.length) {
    return res.status(400).json({ error: "bad_request", message: "Add the newsletter first." });
  }
  const content = [{ type: "text", text: buildPrompt(settings, String(lesson), pics.length > 0) }];
  for (const url of pics) content.push({ type: "image_url", image_url: { url } });

  const body = { model: MODEL, messages: [{ role: "user", content }], response_format: { type: "json_object" } };
  if (/^(gpt-5|o\d)/.test(MODEL)) body.reasoning_effort = "low";

  try {
    const data = await openai("/chat/completions", body);
    const text = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error("The story came back garbled. Try again."), { status: 502, code: "invalid_json" }); }
    res.status(200).json({ story: { ...clean(parsed), phonetic: settings.phonetic === "zhuyin" ? "zhuyin" : "pinyin", level: levelFor(settings.age, settings.boost), age: Number(settings.age) || 3 } });
  } catch (e) {
    fail(res, e);
  }
}
