# Digital-twin proxy (Cloudflare Worker)

This tiny worker holds your OpenRouter API key **server-side** and answers career
questions from the portfolio's chat widget. The key never touches the public page.

## One-time deploy (free)

1. **Create a Cloudflare account** (free): https://dash.cloudflare.com/sign-up
2. **Install Wrangler** (Cloudflare's CLI) — needs Node.js:
   ```bash
   npm install -g wrangler
   ```
3. **Log in:**
   ```bash
   wrangler login
   ```
4. **From this folder**, store your OpenRouter key as an encrypted secret:
   ```bash
   cd twin-worker
   wrangler secret put OPENROUTER_API_KEY
   # paste your sk-or-v1-... key when prompted
   ```
5. **Deploy:**
   ```bash
   wrangler deploy
   ```
   Wrangler prints a URL like `https://aman-twin.<your-subdomain>.workers.dev`.

## Wire it into the portfolio

Open `../index.html`, find the line:
```js
const TWIN_ENDPOINT = "";   // <-- paste your Worker URL here
```
and set it to your Worker URL, e.g.:
```js
const TWIN_ENDPOINT = "https://aman-twin.yourname.workers.dev";
```
Commit & push — the chat widget goes live. Until this is set, the widget shows a
friendly "chat is being set up" note instead of erroring.

## Notes
- Free tier: 100,000 requests/day — far more than a portfolio needs.
- Uses free OpenRouter models with fallback, so running cost is €0.
- To update Aman's facts, edit `CAREER_FACTS` in `worker.js` and re-run `wrangler deploy`.
- **Rotate the OpenRouter key** if it was ever shared in plaintext.
