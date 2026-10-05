import { checkPasscode, requirePost, openai, fail } from "./_lib.js";

const MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const BGS = ["sky", "meadow", "sunset", "night", "sea", "sand", "blossom"];

function sentenceGuide(age) {
  const a = Number(age);
  if (a <= 2) return "one very short sentence per page, 3 to 7 characters, lots of repetition and sound words";
  if (a === 3) return "one short sentence per page, about 6 to 14 characters, simple words, gentle repetition";
  if (a === 4) return "one or two short sentences per page, up to about 22 characters";
  return "two or three short sentences per page, up to about 35 characters";
}

const clip = (v, n) => (typeof v === "string" ? v : "").slice(0, n);

export function buildPrompt(s, lesson, withImages) {
  const zhuyin = s.phonetic === "zhuyin";
  const pages = [6, 8, 10].includes(Number(s.length)) ? Number(s.length) : 8;
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
- Length: ${sentenceGuide(s.age)}.

STORY
- Exactly ${pages} story pages. One simple idea per page.
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
    res.status(200).json({ story: { ...clean(parsed), phonetic: settings.phonetic === "zhuyin" ? "zhuyin" : "pinyin" } });
  } catch (e) {
    fail(res, e);
  }
}
