# 🩷 SquishyGPT — Serena's Optometry Brain

A private, mobile-first **RAG chat** over Serena's optometry study sets (Quizlet flashcards). Ask anything by **text or voice**, and get answers grounded in her own study material.

- **Answers:** Anthropic **Claude** (streaming)
- **Retrieval:** **OpenAI embeddings** + **Postgres / pgvector**
- **Frontend:** **Next.js** (App Router) + Tailwind, mobile-first
- **Auth:** single shared password (just Serena)
- **Voice:** browser speech-to-text (with room to upgrade to cloud transcription)
- **Hosting:** Railway

## How it works

```
You ask → embed question (OpenAI) → top-k similar cards (pgvector)
        → Claude answers using those cards as context → streamed back
```

Each Quizlet card becomes one embedded chunk (`Term: … / Definition: …`). At query time we retrieve the most similar cards and hand them to Claude as context, so answers reflect how Serena actually studied.

## Local development

1. **Install**

   ```bash
   npm install
   ```

2. **Configure env** — copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` (a Postgres with the `pgvector` extension)
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `SITE_PASSWORD` and `SESSION_SECRET`

   Quick local Postgres with pgvector:

   ```bash
   docker run -d --name squishy-pg -p 5432:5432 \
     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=squishygpt \
     pgvector/pgvector:pg16
   # then in .env.local:
   # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/squishygpt
   # PGSSL=disable
   ```

3. **Create the schema**

   ```bash
   npm run migrate
   ```

4. **Load study sets** (see below), then:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, enter your `SITE_PASSWORD`.

## Adding Serena's Quizlet sets

Two ways:

**A) In the app (easiest).** Go to **Study sets** (top-right), paste a set's exported
text, give it a title, and tap **Add to brain**.

> In Quizlet: open a set → **⋯ (More)** → **Export** → copy. Default export puts a
> **Tab** between term and definition and a **new line** between cards. SquishyGPT
> auto-detects tabs, ` - `, ` : `, and `|` separators.

**B) From the command line** (bulk):

```bash
npm run ingest -- --title "Ocular Disease" data/sample-ocular-disease.txt
```

A sample set lives in `data/sample-ocular-disease.txt` to try things out.

## Deploy to Railway

1. Create a Railway project from this GitHub repo.
2. Add the **Postgres** plugin (it sets `DATABASE_URL`). pgvector is available;
   `npm run migrate` enables the extension.
3. Set service variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SITE_PASSWORD`,
   `SESSION_SECRET` (and optionally `ANTHROPIC_MODEL`).
4. Deploy. Then run the migration once (Railway shell or locally pointed at the
   Railway `DATABASE_URL`):

   ```bash
   npm run migrate
   ```

5. Open the generated URL on your phone and add it to your home screen.

`railway.json` configures build (`npm run build`) and start (`npm run start`).

## Roadmap / notes

- **Quizlet URL import:** the data model stores a `source_url`; automatic
  scraping from a URL is a planned enhancement (Quizlet has no public API, so
  this needs a confirmed extraction method).
- **Cloud transcription:** voice currently uses the browser's built-in
  speech-to-text. An OpenAI Whisper upgrade for noisy clinics is a natural next
  step.

> Study aid based on Serena's own sets. Not a substitute for clinical judgment.
