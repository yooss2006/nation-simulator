CREATE TABLE IF NOT EXISTS saves (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision > 0),
 engine_version text NOT NULL DEFAULT '0.1.0',
 schema_version integer NOT NULL DEFAULT 1,
 snapshot_key text NOT NULL,
 checksum text NOT NULL
);
CREATE INDEX IF NOT EXISTS saves_owner ON saves(owner_id);
-- API service owns this table. Do not grant public/anon SELECT or UPDATE.
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;
