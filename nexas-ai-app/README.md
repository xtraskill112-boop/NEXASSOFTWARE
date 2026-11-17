# Nexas AI

Your own AI assistant, powered by Claude. It runs in any web browser, on a phone or a computer.

**What it does**

| Tool | What you give it | What you get |
|---|---|---|
| Chat | Any question, in English, Hindi or Hinglish | A clear answer |
| Product listing | Product details or a photo | Title, 5 bullet points, description, search keywords and category, ready for Amazon, Flipkart, Meesho, Etsy or Shopify |
| Social post | A product or an occasion | 3 Instagram or Facebook captions plus hashtags |
| Customer reply | The customer's message | A polite reply in English and Hindi |
| Translate | Any text | Hindi ↔ English, or any language you name |

You also get voice typing (the mic button), read-aloud (**Listen**), **Copy** on every answer, and a speed setting: **Fast**, **Balanced** or **Deep thinking**.

## Set it up (about 10 minutes, one time)

### 1. Turn on the website

1. On GitHub, open this repository and go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. Re-run the latest **Deploy to GitHub Pages** job if it failed before Pages was on. After about a minute it turns green.
4. Your AI is now live at **`https://<your-github-username>.github.io/nexas-ai/`**. Bookmark it, or use "Add to Home Screen" on your phone.

### 2. Get a Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up. This is a different account from a claude.ai subscription.
2. Under **Billing**, add some credit. Five US dollars is enough to try it out.
3. Under **Limits**, set a monthly spend limit so you never pay more than you plan to.
4. Under **API keys**, click **Create key** and copy it. It starts with `sk-ant-`.

### 3. Connect the key

Open your Nexas AI website, tap **Add API key** (or the ⚙ settings button), paste the key, and tap **Save**. Start chatting.

## Cost

You pay Anthropic only for what you use. Nexas AI uses Claude Opus 5.5, which costs $4 per million input tokens and $20 per million output tokens. A typical answer costs a few US cents. **Fast** is the cheapest setting and **Deep thinking** is the most thorough.

## Privacy and safety

- Your API key is saved only in your own browser and sent only to Anthropic (`api.anthropic.com`). It is never put on GitHub.
- Anyone who opens the website needs their own key. They can't use yours.
- Anyone who uses your phone or computer could use the saved key. On a shared device, untick **Remember the key on this device**. The key is then forgotten when the tab closes.
- If a key ever leaks, delete it in the Claude Console and create a new one.
- Your chat history is saved in your browser so it's still there next time. **New chat** clears it. Photos are not saved.

## Change how it answers

All of the instructions live in [`src/prompts.js`](src/prompts.js). You can edit them on GitHub: open the file and click the pencil icon. For example, you can add your brand name, shipping policy or price list. When you save, the website updates by itself in about a minute.

## For developers

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
```

- Plain JavaScript and [Vite](https://vite.dev), with the official [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) running in the browser (`dangerouslyAllowBrowser: true`). Each visitor brings their own key.
- Requests stream from `claude-opus-5-5` with adaptive thinking. The speed setting maps to `output_config.effort` (`low` / `medium` / `high`).
- Server-side refusal fallbacks are on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If a safety check declines a request, the API retries it on a suitable fallback model.
- Earlier answers are sent back as plain text, so switching tools in the middle of a chat never breaks the conversation.
- `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`.
