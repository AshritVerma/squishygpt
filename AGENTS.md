# AGENTS.md — SquishyGPT

Context for AI agents (including the Cursor mobile app) continuing this project.

## What this is

SquishyGPT is a private RAG chat app — "Serena's optometry brain." It answers
optometry questions grounded in Serena's own Quizlet flashcards. Mobile-first,
used in clinic by text or voice.

## Stack

- Next.js 16 (App Router, `src/` dir), TypeScript, Tailwind v4 (CSS-config in `globals.css`).
- Claude (Anthropic) for generation; OpenAI embeddings for retrieval.
- Postgres + pgvector for the vector store (`pg` driver, raw SQL).
- Single-password auth via HMAC-signed cookie + `middleware.ts`.

## Map

- `src/lib/db.ts` — pooled Postgres client + `toVector()` helper.
- `src/lib/embeddings.ts` — OpenAI embeddings (`text-embedding-3-small`, 1536 dims).
- `src/lib/anthropic.ts` — Claude client, model, and system prompt.
- `src/lib/quizlet.ts` — parses Quizlet exports into term/definition cards (with optional `termImage`/`definitionImage`).
- `src/lib/cardImages.ts` — download a card image (`fetchImage`) + Claude vision caption (`captionImage`).
- `src/lib/sets.ts` — `ingestSet`, `listSets`, `deleteSet`, `backfillSetImages`.
- `src/lib/retrieval.ts` — embed query, pgvector top-k, build context + sources + `retrievedImages`.
- `src/lib/auth.ts` — session token sign/verify (Web Crypto, edge-safe).
- `src/middleware.ts` — gates all routes except `/login` + `/api/login`.
- `src/app/api/chat/route.ts` — RAG + streaming Claude; sources in `X-Sources`, card images in `X-Images`.
- `src/app/api/sets/route.ts` — GET/POST/DELETE study sets (admin).
- `src/app/api/card-images/[id]/route.ts` — serves a stored card image (bytes + mime, immutably cached).
- `src/app/api/arcade/image-cards/route.ts` — random image cards + same-set multiple-choice terms for the study games.
- `src/components/arcade/` — Cleia's Arcade. Study games built on card images: `NameThatPicGame`, `PicMatchGame`, `SnapJudgmentGame` (shared bits in `imageCards.tsx`). New game ids need an `EARN_CAPS` entry in `src/lib/rewards.ts` or the wallet rejects their sessions.
- `src/app/api/login|logout/route.ts` — auth.
- `src/components/Chat.tsx`, `MessageBubble.tsx`, `VoiceButton.tsx`, `ImageLightbox.tsx` — UI.
- `src/app/page.tsx` (chat), `login/page.tsx`, `admin/page.tsx`.
- `db/schema.sql`, `scripts/migrate.ts`, `scripts/ingest.ts`, `data/`.

## Conventions

- Keep it mobile-first and fast; this is used one-handed on a phone in clinic.
- API routes that touch the DB use `runtime = "nodejs"` (pgvector needs Node, not edge).
- If you change the embedding model, update `EMBED_DIM` and the `vector(1536)` column.
- Don't commit secrets; everything sensitive is in env vars (see `.env.example`).

## Common commands

```bash
npm run dev        # local dev
npm run migrate    # apply db/schema.sql (needs DATABASE_URL)
npm run ingest -- --title "Set Name" path/to/export.txt
npm run ingest:json # ingest data/quizlet-export.json (downloads + captions any card images)
npm run ingest:json -- --images # backfill images onto already-ingested sets (stable set ids)
npm run build && npm start
```

Card images: the Quizlet exporter (`scripts/quizlet-export.js`) captures image
URLs per card side; ingest downloads them into the `card_images` table and
writes a Claude vision caption (model via `CAPTION_MODEL`, defaults to Sonnet;
Quizlet's `_m` thumbnail URLs are fetched at full size via `_b`).
The caption is embedded with the card so image-only cards are searchable. Every
image on a retrieved card is sent to the client; Claude places the most useful
inline with `[[image:N]]` markers and the rest render in a thumbnail strip.

## Known next steps

- Automatic Quizlet import from a pasted set URL (no public API; needs a chosen scrape method).
- Optional OpenAI Whisper transcription for noisy clinic audio (UI already has a mic).
