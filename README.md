# Story Week 週週故事

Turns a preschool's weekly class newsletter into a short illustrated picture book in Traditional Chinese (with pinyin or 注音) and English.

- Upload the newsletter PDF, or a photo of it, or paste the text.
- Set the child's age, favorite things, and anything to include or leave out.
- OpenAI writes the story and draws a picture for every page.
- Read it as a full-screen picture book: swipe to turn pages, tap 🔊 to hear it read aloud, and tap 🎨 to redraw a page.

Stories and pictures are saved in the browser on the device you use (IndexedDB), so each phone or computer has its own bookshelf.

## Host it on Vercel (free)

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. Click **Add New → Project**, pick this repository and click **Import**. Leave the framework as **Other**.
3. Under **Environment Variables**, add:
   - `OPENAI_API_KEY`: your key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - `APP_PASSCODE`: any word you choose. It stops strangers who find the link from spending your OpenAI credit. Type the same word into **About your child → App passcode** in the app.
4. Click **Deploy**. Open the link on your phone and use **Share → Add to Home Screen** to get it as an app.

### Optional settings

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` | Model that writes the story |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Model that draws the pictures |
| `OPENAI_IMAGE_QUALITY` | `medium` | `low` is faster and cheaper, `high` is nicer and slower |

An 8-page story makes 9 pictures (8 pages and a cover). Check OpenAI's pricing page for current costs.

## Run it on your computer

```sh
OPENAI_API_KEY=sk-... node dev-server.js
```

Then open http://localhost:3000. No `npm install` needed; it uses Node 20 or newer.

## How it fits together

- `public/` is the app: `index.html`, `app.js`, `styles.css`. PDFs are read in the browser with pdf.js.
- `api/story.js` asks OpenAI for the story as JSON: Traditional Chinese text, one sound-guide syllable per character, English, and a picture description for each page.
- `api/image.js` draws one page's picture, reusing the story's art style and character descriptions so the pages match.
- The OpenAI key only lives on the server and is never sent to the browser.
