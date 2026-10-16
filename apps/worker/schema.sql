-- Run once in the Supabase SQL editor. The old Fastify saves table is untouched.
CREATE TABLE IF NOT EXISTS cloud_saves (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision > 0),
 snapshot_key text NOT NULL UNIQUE,
 previous_key text,
 checksum text NOT NULL CHECK(length(checksum)=64),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576),
 engine_version text NOT NULL DEFAULT '0.1.0',
 schema_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS cloud_saves_owner ON cloud_saves(owner_id);
CREATE TABLE IF NOT EXISTS cloud_save_quota (
 owner_id uuid PRIMARY KEY,
 day date NOT NULL,
 writes integer NOT NULL DEFAULT 0,
 reads integer NOT NULL DEFAULT 0
);
ALTER TABLE cloud_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_save_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cloud_saves, cloud_save_quota FROM PUBLIC, anon, authenticated;

-- UPSERT obtains a row lock: parallel requests cannot exceed the allowance.
CREATE OR REPLACE FUNCTION consume_cloud_quota(p_owner uuid,p_write boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE q cloud_save_quota; today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
 INSERT INTO cloud_save_quota(owner_id,day,writes,reads)
 VALUES(p_owner,today,CASE WHEN p_write THEN 1 ELSE 0 END,CASE WHEN p_write THEN 0 ELSE 1 END)
 ON CONFLICT(owner_id) DO UPDATE SET
 day=today,
 writes=CASE WHEN cloud_save_quota.day=today THEN cloud_save_quota.writes ELSE 0 END + CASE WHEN p_write THEN 1 ELSE 0 END,
 reads=CASE WHEN cloud_save_quota.day=today THEN cloud_save_quota.reads ELSE 0 END + CASE WHEN p_write THEN 0 ELSE 1 END
 WHERE cloud_save_quota.day<>today OR
 (CASE WHEN p_write THEN cloud_save_quota.writes<30 ELSE cloud_save_quota.reads<300 END)
 RETURNING * INTO q;
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION commit_cloud_save(p_owner uuid,p_id uuid,p_expected integer,p_key text,p_checksum text,p_size integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_save cloud_saves;
BEGIN
 -- Global lock is intentionally acceptable for <=10 private testers.
 PERFORM pg_advisory_xact_lock(726419321);
 SELECT * INTO current_save FROM cloud_saves WHERE id=p_id AND owner_id=p_owner FOR UPDATE;
 IF p_expected=0 THEN
  IF EXISTS(SELECT 1 FROM cloud_saves WHERE id=p_id) THEN RETURN '{"ok":false,"reason":"conflict"}'::jsonb; END IF;
  IF (SELECT count(*) FROM cloud_saves WHERE owner_id=p_owner)>=3 OR (SELECT count(*) FROM cloud_saves)>=30 THEN
   RETURN '{"ok":false,"reason":"quota"}'::jsonb;
  END IF;
  INSERT INTO cloud_saves(id,owner_id,revision,snapshot_key,checksum,byte_size) VALUES(p_id,p_owner,1,p_key,p_checksum,p_size);
 ELSE
  IF current_save.id IS NULL OR current_save.revision<>p_expected THEN RETURN '{"ok":false,"reason":"conflict"}'::jsonb; END IF;
  UPDATE cloud_saves SET revision=p_expected+1,previous_key=snapshot_key,snapshot_key=p_key,checksum=p_checksum,byte_size=p_size WHERE id=p_id AND owner_id=p_owner;
 END IF;
 RETURN jsonb_build_object('ok',true,'oldKey',current_save.previous_key);
END $$;
REVOKE ALL ON FUNCTION consume_cloud_quota(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION commit_cloud_save(uuid,uuid,integer,text,text,integer) FROM PUBLIC, anon, authenticated;
-- Connect Hyperdrive with a server-only DB role permitted to use these tables/functions.
-- Never use this credential in VITE_* variables or grant access to browser roles.
