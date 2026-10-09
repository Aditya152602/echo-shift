# ECHO SHIFT — Multiplayer Strategy Arena

A responsive real-time party game for 2–8 players. Players join a room by code, memorize a symbol sequence, choose its final symbol, earn points and energy, and use Shield/Pulse abilities. Five rounds determine the champion.

## Stack
- React + TypeScript + Vite
- Netlify Functions (`netlify/functions/game.mjs`)
- Netlify Blobs with strong consistency and conditional writes
- CSS responsive layout; no external API keys or database setup required

## Run locally

Requirements: Node.js 20+ recommended.

```bash
npm install
npm run dev
```

For local function emulation, install the Netlify CLI and run `netlify dev`. The client calls `/.netlify/functions/game` directly; Vite alone serves the frontend but does not emulate Netlify Functions.

## Test and build

```bash
npm test
npm run build
```

## Deploy with Netlify Drop

1. Run `npm install` and `npm run build` to verify the build locally.
2. Deploy this folder using Netlify's Git-based deployment (recommended), or upload a ZIP built from the project root to Netlify Drop. Netlify Drop's current support for serverless function deployment can vary by workflow; if the function is not recognized from a manual ZIP upload, use a Git-connected deploy or Netlify CLI deploy instead.
3. Confirm the function `/.netlify/functions/game` is deployed and the Netlify Blobs store is available to Functions.
4. Open the public URL in two separate browser sessions, create a room, join with the six-character code, and play through five rounds.

No GitHub account is required by the code itself, but Netlify account access is required to publish a public URL. Do not expose private tokens in frontend code.

## Game rules
- 2–8 players; host creates the room and starts with at least two players.
- Each round: 7 seconds to memorize a sequence, then 15 seconds to answer.
- Correct answer: 100 points; first correct answer in the round: +25; correct answer submitted within 3 seconds: +10.
- Correct answers grant one energy charge, maximum three.
- Shield costs one energy and blocks the next incoming Pulse.
- Pulse costs one energy and scrambles a rival's next sequence.
- Highest score after five rounds wins. Ties break by correct answers, then fastest cumulative response time.

## Architecture and limitations
Room state is stored as one JSON object in a strongly consistent Netlify Blobs store. The function uses a short-lived per-room lock created with conditional writes and uses `onlyIfMatch` when committing room changes. This is a best-effort concurrency guard for a lightweight party-game prototype, not a substitute for transactional database semantics. For high-concurrency or production competitive play, migrate mutable room state to a transactional database and consider WebSockets/presence service. The current frontend polls state roughly every 1.1 seconds; it is not WebSocket-based.

The app intentionally sends no answer keys to clients. The server validates the answer index and computes scores.

## Build verification status for this generated archive

The source syntax checks and the included 3-test contract suite pass. A full Vite production build and dependency lockfile generation could not be run in the generation environment because access to `registry.npmjs.org` failed with a DNS `EAI_AGAIN` error. Therefore this archive is source-complete but has **not** been verified as a production build. On a network-enabled build runner, run `npm install` to resolve dependencies and create `package-lock.json`, then `npm run build`. The archive does not include a fabricated/incomplete lockfile.
