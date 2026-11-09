# Ship Log

**Build in public, one day at a time.** Log what you shipped today, turn it into an X post in one click, and keep a streak — every day recorded on BOT Chain.

*Free to use (gas only). No tokens, no payments, no accounts. Public GitHub repos only.*

## Status

| | |
|---|---|
| Live site | _not published yet_ (GitHub Pages + custom domain) |
| Contract (BOT Chain mainnet, chain ID 677) | [`0x0a8c0369949DEd5068C83Fa9ebfe7221508839d9`](https://scan.botchain.ai/address/0x0a8c0369949DEd5068C83Fa9ebfe7221508839d9) — set in `assets/config.js`, shown in the footer. Curator: `0x88F839FdeF14D4329E4219E3fCB13a4018514D67` |
| Contract (testnet, chain ID 968) | _not deployed yet_ |
| Worker | _not deployed yet_ — paste its URL into `worker` in `assets/config.js` |

With the mainnet address set, logging and handles are real transactions. With `?preview`, the site runs in **preview mode**: transactions are simulated in the browser and Explore shows clearly-labelled **sample builders**. A yellow bar says so, and has **Skip a day →** (to try streaks, the weekly freeze and Sunday recaps) and **Reset preview**. In live mode only real on-chain profiles are shown.

## What's inside

| Route | What it is |
|---|---|
| `/` | Website: hero with a floating collage (mouse parallax) · welcome band · problem statement · feature trio · 6 alternating demos (today's card, auto commits, AI posts, heatmap & streaks, Explore, proof on BOT Chain) · builders carousel “01 / 04” (real profiles) · “Free. Just gas.” · Answers (FAQ) · closing CTA · stamped-log-card footer |
| `/app` | Today: connect → claim a handle (first time) → today's card (shipped ≤ 140, blocked ≤ 100, next ≤ 100, tag, energy, link, commits pulled from linked repos) → **Log today** / **Update today** with the “DAY 12” stamp → ✨ Make my post (X post + 3-post thread, tone, @BOTChain_ai option, copy / Open in X / share-card PNG) → weekly recap on Sundays. Side: streak, best, totals, freeze left, 20-week heatmap, last 5 entries |
| `/app/profile` | Set up / edit: handle (live availability check), bio, up to 5 `owner/repo`, optional GitHub username (author filter) and timezone (these two stay in the browser) |
| `/app/explore` | Latest logs from everyone (newest first), filter by tag or “Following”, 🔥 longest streaks, 🚀 launching today |
| `/@handle` | Public profile: handle, bio, repos, Follow (local), current / best streak, days and commits logged, 52-week heatmap, timeline with explorer + report links. Curator sees “Hide from Explore” |

```
index.html              shell: nav, footer (stamped log card), base path + 404 restore
404.html                GitHub Pages SPA redirect (/@mika → /?r=@mika)
deploy.html             one-click deploy from MetaMask (testnet / mainnet)
assets/
  config.js             ← contract addresses, Worker URL, links (the one place to edit)
  logic.js              pure rules shared by app, Worker and tests: UTC days, streaks, validation, heatmap, template posts
  chain.js              wallet + contract (live) and the preview simulation
  github.js             today's commits from public repos (cached 5 min)
  ai.js                 Worker calls with template fallback
  heatmap.js            SVG heatmap (own code) + diagonal fill animation
  main.js · home.js · app.js · ui.js · styles.css
contracts/ShipLog.sol   the contract
worker/                 Cloudflare Worker: /ship/post · /ship/recap
tools/                  compile, tests, dev server
build/                  ABI + bytecode + standard JSON input (for explorer verification)
```

## Rules

- **Day** = `block.timestamp / 1 days` (UTC). One entry per wallet per day; logging again the same day updates it.
- **Streak** = consecutive UTC days with an entry. Once per week (Monday–Sunday, UTC) a single missed day is bridged automatically (the “freeze”). Two missed days in a row, or a second miss in the same week, starts a new streak at day 1. Rest days count — tag them “Resting”.
- The stored streak only changes when you log, so the app shows the *live* streak (0 once it's broken) everywhere.
- **Commits**: `GET /repos/{o}/{r}/commits?since&until` for today's UTC window (optional author filter). Messages stay in the browser; only the count goes on-chain. If GitHub rate-limits, you type the number.
- **AI posts**: entry + commit messages → post and thread; rules: use only what's written, no invented metrics, stay ≤ 280. If the Worker is off or fails, a simple template post is written in the browser.
- **Content safety**: length caps (app: characters; contract: bytes), a small word filter (app + Worker), a Report link on every entry (goes to `links.report`), and the curator can hide builders from Explore (their entries stay on-chain and on their profile).

## Contract

`contracts/ShipLog.sol` — Solidity ^0.8.20, optimizer 200 runs, EVM `paris`. Runtime ≈ 11.8 KB. No tokens or payments. The deployer is the curator.

- `claimHandle(handle, bio, repos)` — lowercase a–z 0–9 _, 3–20, unique; renaming frees the old handle
- `updateProfile(bio, repos)` · `logToday(shipped, blocked, next, link, tag, energy, commits)`
- `setHidden(addr, bool)` · `setCurator(addr)` — curator only
- Views: `getEntries(addr, from, count)`, `getProfile(addr)`, `getBuilders(from, count)`, `getFeed(skip, count)` (newest first, with handle + streak), `addrOfHandle(handle)`, `stats()` (builders, entries), `currentDay()`, `weekOf(day)`, plus the public mappings from the PRD
- Events: `HandleClaimed(who, handle)`, `ProfileUpdated(who)`, `Logged(who, day, tag, commits, streak)`, `HiddenSet(who, hidden)`, `CuratorChanged(curator)`
- Gas (local test): a full entry ≈ 690k (strings are stored on-chain). The app adds a gas buffer so a log sent just before 00:00 UTC still goes through if it lands after midnight.

## Run locally

```bash
node tools/serve.mjs
```

Open http://localhost:4623. The server falls back to `index.html` for app routes, like GitHub Pages does with `404.html`. Add `?preview` to force preview mode once a contract is set, or `?net=testnet` to use the testnet contract.

## Tests

```bash
npm --prefix tools install
```

```bash
node tools/compile.mjs && node tools/test-contract.mjs && node tools/test-logic.mjs
```

10 contract checks (every rule in PRD section 5, with time travel across days and weeks, and a check that the app's streak replay matches the chain) and 6 logic checks (UTC days and weeks, streak states, validation, heatmap, template posts ≤ 280).

## Deploy

1. **Contract** — `node tools/serve.mjs`, open http://localhost:4623/deploy.html, deploy to testnet, claim a handle and log a day (`/app?net=testnet`), then deploy to mainnet from the wallet that should be curator. Paste the address into `assets/config.js` (`networks.mainnet.contract`) and into the table above. Verify on scan.botchain.ai with `build/ShipLog.standard-input.json` (compiler 0.8.20).
2. **Worker** —
   ```bash
   cd worker && npm install && npx wrangler secret put ANTHROPIC_API_KEY
   ```
   Set `ALLOWED_ORIGINS` in `worker/wrangler.toml`, optionally create the `RATE` KV namespace (40 calls / IP / day), then `npx wrangler deploy` and paste the URL into `worker` in `assets/config.js`. Posts use Claude Opus 5.5 at low effort with structured JSON output and the server-side refusal fallback. The routes are self-contained and can be copied into the shared Week 1 Worker (it imports `assets/logic.js` for limits and the word filter). Observability is off, so entries are never logged.
3. **Site** — push to GitHub, enable Pages (root), add the custom domain. Fill in `links.x`, `links.github` and `links.report` in `assets/config.js`.

## Notes on the PRD

- **Repos on-chain:** `claimHandle` takes `repos` as a third argument (and `updateProfile(bio, repos)` edits them) so profiles can show linked repos and setup is a single transaction.
- **Explore and heatmap read views, not event logs:** `getFeed` / `getEntries` / `getBuilders` return everything directly, which works on any RPC without `eth_getLogs` range limits. `Logged` events are still emitted for indexers. Per-entry explorer links point to the builder's address page.
- **Extra views:** `getFeed`, `getBuilders`, `currentDay`, `weekOf`, `entryCountOf`, `totalCommits`, `freezeWeek`, `reposOf` — needed for the feed, leaderboard and freeze display.
- **Commits window:** the UTC day (same day as the chain), so the commit count always matches the entry's day.
- **Share card:** html-to-image is loaded only when you press “Download share card”.

## Libraries (CDN)

ethers 6.13.5 · GSAP 3.13 (ScrollTrigger, SplitText, Flip, ScrambleText) · html-to-image 1.11.11 (on demand) · Google Fonts (Instrument Sans, Inter, JetBrains Mono, Workbench).
