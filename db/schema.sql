-- SquishyGPT schema. Requires the pgvector extension (available on Railway Postgres).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sets (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  source_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cards (
  id          BIGSERIAL PRIMARY KEY,
  set_id      BIGINT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  term        TEXT NOT NULL,
  definition  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Full-text index backing the keyword retrieval fallback (see lib/retrieval),
-- which grounds answers in her cards when the embedding API is unreachable.
-- The expression must stay identical to the one in retrieveByKeyword() for
-- the index to be used.
CREATE INDEX IF NOT EXISTS cards_fts_idx
  ON cards USING gin (to_tsvector('english', term || ' ' || definition));

-- One embedded chunk per card. vector(1536) matches text-embedding-3-small.
CREATE TABLE IF NOT EXISTS chunks (
  id          BIGSERIAL PRIMARY KEY,
  card_id     BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  set_id      BIGINT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_set_id_idx ON chunks (set_id);

-- Images attached to a card side (from Quizlet). Stored in Postgres rather
-- than hotlinked from Quizlet's CDN: they are small, Railway Postgres is
-- already here, and CDN links can break. An image-only side keeps its text
-- column as '' so the cards NOT NULL constraints still hold. The caption is a
-- Claude-written clinical description that also gets embedded with the card,
-- so image-only cards become searchable.
CREATE TABLE IF NOT EXISTS card_images (
  id          BIGSERIAL PRIMARY KEY,
  card_id     BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  side        TEXT NOT NULL CHECK (side IN ('term', 'definition')),
  source_url  TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       BYTEA NOT NULL,
  caption     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id, side)
);

CREATE INDEX IF NOT EXISTS card_images_card_id_idx ON card_images (card_id);

-- HNSW index for cosine similarity search. HNSW gives accurate results at any
-- scale (unlike ivfflat, which needs many rows per list to behave well), so it
-- is the right choice for a personal study set that starts small.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- Small key/value store for per-user client state (conversation history,
-- arcade high scores). Single-user app, so no user column needed.
-- NOTE: the paw-points wallet used to live here too, but it is now
-- server-authoritative (see wallet_ledger below) so it can't be tampered with
-- by editing client-synced JSON. Legacy wallet rows here are read once to seed
-- the ledger, then ignored.
CREATE TABLE IF NOT EXISTS client_state (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- gen_random_uuid() lives in pgcrypto (core on PG13+, extension elsewhere).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Paw-points wallet: server-authoritative and tamper-resistant.
--
-- The balance is NEVER stored as a mutable number the client can set. Instead
-- it is DERIVED from an append-only ledger: every earn (game payout) and every
-- redeem (reward) is a row. balance = SUM(amount), lifetime = SUM(earn). The
-- only way to change the balance is through the /api/wallet endpoints, which
-- enforce per-run caps, a rolling daily cap, and single-use game sessions.
-- Single-user app, so no user column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('earn', 'redeem')),
  amount      INTEGER NOT NULL, -- positive for earn, negative for redeem
  game_id     TEXT,             -- set for earns
  reward_id   TEXT,             -- set for redeems
  session_id  UUID,             -- the consumed game session, for earns
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_ledger_kind_created_idx
  ON wallet_ledger (kind, created_at);

-- One row per redeemed reward (the real-life voucher Ashrit honors).
CREATE TABLE IF NOT EXISTS wallet_claims (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  ledger_id   BIGINT REFERENCES wallet_ledger(id) ON DELETE SET NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wallet_claims_created_idx
  ON wallet_claims (created_at DESC);

-- Server-issued, single-use tokens that tie an earn to a game the client
-- actually opened. A payout is only accepted with a fresh, unconsumed session
-- for the matching game, which stops replaying one result or PUTing points.
CREATE TABLE IF NOT EXISTS game_session (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);
