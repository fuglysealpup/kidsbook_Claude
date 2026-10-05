// Prompt pieces shared by story writing (story.js) and story editing (revise.js).

export const BGS = ["sky", "meadow", "sunset", "night", "sea", "sand", "blossom"];
export const DEFAULT_STYLE = "soft watercolor and colored pencil, warm gentle colors, rounded friendly shapes, simple uncluttered backgrounds";
export const clip = (v, n) => (typeof v === "string" ? v : "").slice(0, n);

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


const phonMode = (s) => (s.phonetic === "zhuyin" ? "zhuyin" : s.phonetic === "none" ? "none" : "pinyin");

function languageRules(s) {
  const mode = phonMode(s);
  const phon = mode === "none"
    ? '"phon" and "titlePhon" are always empty strings ""; the family reads the characters without a sound guide.'
    : `"phon" is the ${mode === "zhuyin" ? "Zhuyin (注音符號) with tone marks" : "Hanyu Pinyin with tone marks, lowercase"} for the "zh" text: exactly one syllable per Chinese character, in order, separated by single spaces, with NO punctuation. Count carefully so the number of syllables equals the number of Chinese characters. Use neutral tones where natural (${mode === "zhuyin" ? "子 ˙ㄗ, 謝謝 ㄒㄧㄝˋ ˙ㄒㄧㄝ" : "子 zi, 謝謝 xiè xie"}).`;
  return `LANGUAGE
- All Chinese must be Traditional characters (繁體中文, as used in Taiwan). Never use Simplified characters.
- ${phon}
- "en" is a natural English translation of the page.`;
}

function heroRules(s) {
  const hero = s.hero && typeof s.hero.description === "string" && s.hero.description.trim();
  const name = clip(s.name, 60);
  const lines = [];
  if (hero) {
    lines.push(`- The hero is ${name || "the child"}. Start "characters" with this exact description of the hero, then add any other recurring characters: ${clip(s.hero.description, 600)}`);
  } else {
    lines.push(`- "characters": an English visual description of every recurring character (species or look, colors, clothing) so an illustrator draws them the same way on every page.${name ? " If the hero is the child, describe a cheerful cartoon child without real-person details." : ""}`);
  }
  lines.push(`- "supporting": an English visual description of every recurring character other than ${name || "the hero"}, one sentence each: name, species or look, body and hair colors, and ONE fixed outfit with exact colors (for example "Mochi, a small round white puppy with floppy ears and a red collar"). They wear that same outfit on every page. Use "" when there are no other recurring characters.`);
  lines.push(`- "style" must be exactly: ${clip(s.style, 300) || DEFAULT_STYLE}`);
  lines.push(`- Each page's "illustration": one or two English sentences describing what the picture shows. No text or signs in the picture.`);
  lines.push(`- Each page's "hero": true when ${name || "the hero"} appears in that page's picture, otherwise false.`);
  return lines.join("\n");
}

function jsonShape(s) {
  const mode = phonMode(s);
  const ex = (zh, py) => (mode === "none" ? "" : mode === "zhuyin" ? zh : py);
  return `{"title":"小兔子買水果","titlePhon":"${ex("ㄒㄧㄠˇ ㄊㄨˋ ˙ㄗ ㄇㄞˇ ㄕㄨㄟˇ ㄍㄨㄛˇ", "xiǎo tù zi mǎi shuǐ guǒ")}","titleEn":"Little Bunny Buys Fruit","cover":"🐰","coverIllustration":"…","bg":"meadow","style":"…","characters":"…","supporting":"…","pages":[{"zh":"…","phon":"${mode === "none" ? "" : "…"}","en":"…","illustration":"…","hero":true,"scene":["🍎","🐰"],"bg":"sky"}],"words":[{"zh":"蘋果","phon":"${ex("ㄆㄧㄥˊ ㄍㄨㄛˇ", "píng guǒ")}","en":"apple","emoji":"🍎"}]}`;
}

function childBlock(s) {
  return `CHILD
- Name for the hero: ${clip(s.name, 60) || "(none given; use a friendly animal hero)"}
- Age: ${clip(String(s.age), 2) || "3"}
- Favorite things (weave one or two in): ${clip(s.interests, 300) || "(not given)"}
- Please include: ${clip(s.include, 300) || "(nothing specific)"}
- Please leave out: ${clip(s.exclude, 300) || "(nothing specific)"}`;
}

export const pageCount = (s) => ([6, 8, 10].includes(Number(s.length)) ? Number(s.length) : 8);

export function buildStoryPrompt(s, lesson, attachments) {
  const pages = pageCount(s);
  return `You write picture-book stories for a young child who attends a Mandarin-English bilingual preschool. Turn this week's classroom lesson into a short story the family can read together at home.

${childBlock(s)}

${languageRules(s)}

READING LEVEL
${levelGuide(levelFor(s.age, s.boost))}

STORY
- Exactly ${pages} story pages.
- Build the story around the lesson's key concepts and vocabulary (themes, words, songs, numbers, colors, values). Use each key word at least twice across the story.
- Warm and playful, with a clear little arc. End happily or calmly. Nothing scary.
${heroRules(s)}
- "scene" is 2 to 4 emoji for the page; put the main subject first. "bg" is one of: ${BGS.join(", ")}.
- "words" lists 4 to 8 key words from the lesson used in the story, each with one emoji.

Reply with only a JSON object in this shape:
${jsonShape(s)}

LESSON
${attachments ? "The attached files are from the school's weekly newsletter. " : ""}This comes from the school's weekly newsletter. It may be in English, Chinese or both. Ignore admin notices such as dates, fees, events and reminders, and focus on what the children learned.
"""
${clip(lesson, 14000) || "(see the attached files)"}
"""`;
}

// A parent's free-form request ("make the dog the main character", "shorter please").
export function buildRevisePrompt(s, story, instruction) {
  return `You are editing a picture-book story for a young child at a Mandarin-English bilingual preschool. A parent asked for a change. Apply it and return the whole updated story.

PARENT'S REQUEST
"""
${clip(instruction, 1000)}
"""

Keep pages the request doesn't touch the same. Keep the lesson's key words. Follow every rule below for anything you change, and update "illustration", "hero", "scene" and "words" to match.

${childBlock(s)}

${languageRules(s)}

READING LEVEL (unless the parent asks for simpler or harder)
${levelGuide(levelFor(s.age, s.boost))}

STORY RULES
- Warm and playful. End happily or calmly. Nothing scary.
${heroRules(s)}
- "bg" is one of: ${BGS.join(", ")}.

CURRENT STORY
${JSON.stringify(storyForModel(story))}

Reply with only the updated story as one JSON object in the same shape.`;
}

// The parent changed some Chinese text by hand: fill in the sound guide and English to match.
export function buildAnnotatePrompt(s, story, idxs, keepEn) {
  const pages = idxs.map((i) => ({ i, zh: story.pages[i].zh, en: story.pages[i].en, keepEnglish: keepEn.includes(i) }));
  return `A parent edited the Chinese text on some pages of a children's picture book. For each page below, return the matching sound guide, English and picture description.

${languageRules(s)}
- When "keepEnglish" is true the parent also wrote the English; return it unchanged.
- "illustration": one or two English sentences describing the picture for the edited text. "hero": whether ${clip(s.name, 60) || "the hero"} appears.

The rest of the story, for context: ${JSON.stringify(story.pages.map((p) => p.zh))}

EDITED PAGES
${JSON.stringify(pages)}

Reply with only JSON: {"pages":[{"i":0,"phon":"…","en":"…","illustration":"…","hero":true}]}`;
}

function storyForModel(story) {
  const { title, titlePhon, titleEn, cover, coverIllustration, bg, style, characters, supporting, pages, words } = story;
  return { title, titlePhon, titleEn, cover, coverIllustration, bg, style, characters, supporting,
    pages: (pages || []).map(({ zh, phon, en, illustration, hero, scene, bg }) => ({ zh, phon, en, illustration, hero, scene, bg })), words };
}

export function clean(story, s) {
  if (!story || !Array.isArray(story.pages) || !story.pages.length) {
    throw Object.assign(new Error("The story came back incomplete. Try again."), { status: 502, code: "bad_shape" });
  }
  const str = (v) => (typeof v === "string" ? v : "");
  const bg = (v) => (BGS.includes(v) ? v : BGS[Math.floor(Math.random() * BGS.length)]);
  const none = phonMode(s) === "none";
  return {
    title: str(story.title) || "這週的故事", titlePhon: none ? "" : str(story.titlePhon), titleEn: str(story.titleEn) || "This week's story",
    cover: str(story.cover) || "📖", coverIllustration: str(story.coverIllustration), bg: bg(story.bg),
    style: str(story.style) || clip(s.style, 300) || DEFAULT_STYLE, characters: str(story.characters), supporting: str(story.supporting),
    pages: story.pages.filter((p) => p && str(p.zh)).slice(0, 14).map((p) => ({
      zh: str(p.zh), phon: none ? "" : str(p.phon), en: str(p.en), illustration: str(p.illustration), hero: p.hero !== false,
      scene: (Array.isArray(p.scene) ? p.scene : []).map(str).filter(Boolean).slice(0, 4), bg: bg(p.bg)
    })),
    words: (Array.isArray(story.words) ? story.words : []).filter((w) => w && str(w.zh)).slice(0, 10)
      .map((w) => ({ zh: str(w.zh), phon: none ? "" : str(w.phon), en: str(w.en), emoji: str(w.emoji) })),
    phonetic: phonMode(s), level: levelFor(s.age, s.boost), age: Number(s.age) || 3
  };
}
