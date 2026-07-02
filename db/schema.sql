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

-- HNSW index for cosine similarity search. HNSW gives accurate results at any
-- scale (unlike ivfflat, which needs many rows per list to behave well), so it
-- is the right choice for a personal study set that starts small.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
