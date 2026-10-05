# Story Week 週週故事

Turns a preschool's weekly class newsletter into a short illustrated picture book in Traditional Chinese (with pinyin, 注音 or no sound guide) and English.

- **First time:** sign in, describe your child, draw their hero once, and pick reading options.
- **Every week:** forward the newsletter email (or add the PDF), adjust anything for this week, and tap Write.
- **Check it:** read the story before any pictures are drawn. Change words directly, or ask for bigger changes in plain words ("make Mochi the dog the main character").
- **Read it:** a full-screen picture book. Swipe to turn pages, tap 🎨 to redraw a page. On a tablet held sideways, the picture sits beside the words.

Stories grow with the child: an 8-step reading level follows their age, and each week's "Story level" makes it easier or harder.

## Set up on Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub. **Add New → Project**, import this repository, leave the framework as **Other**.
2. Add the environment variables below, then **Deploy**.
3. **Storage → Create Database → Blob**, choose **Public**, connect it to this project, then **Deployments → ⋯ → Redeploy**. This gives you one bookshelf shared across your devices.
4. On your phone, open the link and use **Share → Add to Home Screen**.

### Environment variables

| Variable | Needed? | What it is |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | From [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ALLOWED_EMAILS` | For sign-in and email | Comma-separated family emails, e.g. `me@gmail.com, partner@icloud.com`. Only these can sign in or forward newsletters. |
| `GOOGLE_CLIENT_ID` | For Google sign-in | See below |
| `APPLE_SERVICE_ID` | For Apple sign-in | See below |
| `INBOUND_SECRET` | For email forwarding | Any long random string; it goes in the Postmark webhook URL |
| `INBOUND_ADDRESS` | For email forwarding | Your Postmark inbound address, shown in the app so you can copy it |
| `SESSION_SECRET` | Optional | Signs sign-in cookies. If unset, one is derived from your OpenAI key. |
| `APP_PASSCODE` | Optional | A simple passcode instead of Google or Apple sign-in |
| `OPENAI_TEXT_MODEL` | Optional | Writes the story. Default `gpt-5-mini`. |
| `OPENAI_IMAGE_MODEL` | Optional | Draws the pictures. Default `gpt-image-1`. |
| `OPENAI_IMAGE_QUALITY` | Optional | `low`, `medium` (default) or `high` |

When `GOOGLE_CLIENT_ID` or `APPLE_SERVICE_ID` is set, the app requires sign-in. Otherwise it uses `APP_PASSCODE` if set.

### Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create a project, set up the **OAuth consent screen** (External, add your email as a test user or publish it).
2. **Create credentials → OAuth client ID → Web application.**
3. Under **Authorized JavaScript origins**, add your app's address, e.g. `https://kidsbook-claude.vercel.app`.
4. Copy the **Client ID** into `GOOGLE_CLIENT_ID`.

### Apple sign-in

Needs a paid Apple Developer account.

1. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list), create an **App ID** with Sign in with Apple enabled.
2. Create a **Services ID** (for example `com.yourname.storyweek`), enable Sign in with Apple, and configure it with your domain (`kidsbook-claude.vercel.app`) and return URL (`https://kidsbook-claude.vercel.app/`).
3. Put the Services ID in `APPLE_SERVICE_ID`.

When Apple asks, choose **Share My Email**, so the email matches `ALLOWED_EMAILS`.

### Email forwarding (Postmark)

1. Create a free account at [postmarkapp.com](https://postmarkapp.com) and a server. Open its **Default Inbound Stream**.
2. Copy the inbound address (like `abc123@inbound.postmarkapp.com`) into `INBOUND_ADDRESS`.
3. Set the inbound **Webhook URL** to `https://<your app>/api/inbound?key=<INBOUND_SECRET>`.
4. Forward the class newsletter to that address from an email on `ALLOWED_EMAILS`. A filter in Gmail or iCloud can do it automatically each week.

The email's text and any PDF attachments wait in the app under "This week's newsletter is here". If the school's email only links to the newsletter, add the PDF in the app as usual.

## Privacy

- The OpenAI key, sign-in checks and allowed emails only live on the server.
- A photo used to describe the hero is sent to OpenAI once to write a description. It is never saved, and it is not sent to the image model.
- Books, pictures and forwarded newsletters are stored in Vercel Blob at long random addresses that can't be guessed, but anyone with an exact picture link can open it.

## Run it on your computer

```sh
npm install
OPENAI_API_KEY=sk-... node dev-server.js
```

Then open http://localhost:3000 (Node 20 or newer). With no sign-in variables set, it opens without signing in.

## How it fits together

- `public/` is the app (`index.html`, `app.js`, `styles.css`). PDFs you add are read in the browser with pdf.js.
- `api/story.js` writes the story as JSON. `api/revise.js` handles review edits. Prompts live in `api/_prompt.js`.
- `api/hero.js` draws the hero's character sheet. `api/image.js` draws each page, passing the sheet as a reference image when the hero is in the picture.
- `api/session.js` checks Google or Apple ID tokens against their public keys and sets a signed cookie. `api/config.js` tells the app how to sign in.
- `api/inbound.js` receives forwarded newsletters from Postmark. `api/books.js` stores books, the child's profile and the newsletter inbox in Vercel Blob.
