# Mirror

Live camera rooms with a one-tap AI answer. One person goes live with a phone/laptop camera (or shares their
screen); everyone else in the room sees it in real time and can tap **Ask AI** to get *only* the answer to the
question on screen — no typing, no question repetition, no explanation unless you ask for one.

## How it works

| Piece | Where it runs | Free tier |
| --- | --- | --- |
| Next.js app + API routes (`/api/token`, `/api/room`, `/api/ask`) | Vercel (serverless functions) | Hobby |
| Video SFU (rooms, presence, media, data channel) | [LiveKit Cloud](https://livekit.io) | Build plan — always-on, no cold starts |
| AI | Gemini / OpenRouter / OpenAI / Anthropic with **the viewer's own key** | provider's own |

- **Rooms & host.** Creating a room makes you the *creator*; the creator is the host at first and is the only one who
  can hand the host role to someone else (exactly one host at a time, stored in LiveKit room metadata). Host and
  creator can remove people. Identities are derived server-side (HMAC) from a per-browser secret, so nobody can
  impersonate the creator or host.
- **Broadcast.** Anyone can turn on their camera (front/back flip on phones) or share their screen. Video is
  published at 1080p with simulcast (360p/720p/1080p) so thumbnails are cheap and the stage stays sharp. The encoder
  is told the content is text (`contentHint = "text"`, `maintain-resolution`).
- **Ask AI.** The viewer's browser asks the broadcaster (LiveKit RPC) for a **full-resolution still** straight from
  their camera, which arrives over a LiveKit byte stream. That way the AI reads a crisp frame instead of a compressed
  video frame. If that fails, it falls back to the received video frame. The still and the viewer's keys go to
  `/api/ask`, which tries each key in priority order until one answers (the "key router"). Keys stay in the viewer's
  `localStorage` and are never stored server-side.
- **Prompt.** `lib/server/prompt.ts`: MCQ → `B) text`, multi-select → all correct options, numeric → value + unit,
  code → code only, descriptive → shortest complete answer. An optional note (e.g. "explain briefly") overrides
  the format.

- **Gemini free tier.** With no model set, the server lists the models the key can use and picks the newest
  Flash, then Flash-Lite (free-tier quotas are per model, so Lite is extra headroom). Retired models and 429s
  fall through automatically. Snapshots are capped at 1536px (~4 image tiles, about 1k tokens). Thinking is
  configurable (Fast / Balanced / Deep) and output is capped, so each answer costs about 1–2k tokens.

Shortcut: press **A** on desktop to ask about the stage feed.

## Deploy (free)

1. **LiveKit Cloud:** create a free project at <https://cloud.livekit.io>, then copy the WebSocket URL, API key
   and API secret from *Settings → Keys*.
2. **Vercel:** import this repo (framework preset: Next.js). Add these env vars, then deploy:
   ```
   LIVEKIT_URL=wss://<your-project>.livekit.cloud
   LIVEKIT_API_KEY=...
   LIVEKIT_API_SECRET=...
   ```
3. Open the site, create a room, and send the invite link to the other devices. Each viewer adds a Gemini key
   (free from <https://aistudio.google.com/apikey>) under **AI keys**.

### Free-tier budget
LiveKit Build: about 5,000 participant-minutes and 50 GB of downstream data per month, with a hard cap (no
surprise bills). As a rough guide, 1 broadcaster and 3 viewers for 1 hour is about 240 participant-minutes. Viewers
get adaptive simulcast layers, so small tiles cost little. Vercel Hobby easily covers the three tiny API routes. If you
outgrow LiveKit's free tier, Cloudflare Realtime SFU (1,000 GB/month free) or a self-hosted LiveKit on an
always-free VM are the next options.

## Local dev

```bash
npm install
# Either use your LiveKit Cloud keys, or run a local server: `livekit-server --dev`
#   LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret
cp .env.example .env.local
npm run dev
```

Camera access needs HTTPS on phones, so test cross-device on the Vercel preview URL (or use a tunnel).
