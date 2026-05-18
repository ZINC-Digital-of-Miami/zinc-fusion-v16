-- Normalize ops.ingest_run.status to one canonical persisted vocabulary.
-- No cloud deployment is performed by this migration file alone.

CREATE OR REPLACE FUNCTION ops.normalize_ingest_run_status(raw_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(trim(raw_status))
    WHEN 'OK' THEN 'SUCCESS'
    WHEN 'SUCCESS' THEN 'SUCCESS'
    WHEN 'ERROR' THEN 'FAILED'
    WHEN 'FAIL' THEN 'FAILED'
    WHEN 'FAILED' THEN 'FAILED'
    WHEN 'RUNNING' THEN 'RUNNING'
    WHEN 'TIMEOUT' THEN 'TIMEOUT'
    ELSE upper(trim(raw_status))
  END
$$;

CREATE OR REPLACE FUNCTION ops.normalize_ingest_run_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := ops.normalize_ingest_run_status(NEW.status);
  RETURN NEW;
END;
$$;

UPDATE ops.ingest_run
SET status = ops.normalize_ingest_run_status(status)
WHERE status IS DISTINCT FROM ops.normalize_ingest_run_status(status);

DROP TRIGGER IF EXISTS normalize_ingest_run_status_before_write ON ops.ingest_run;

CREATE TRIGGER normalize_ingest_run_status_before_write
BEFORE INSERT OR UPDATE OF status ON ops.ingest_run
FOR EACH ROW
EXECUTE FUNCTION ops.normalize_ingest_run_status_trigger();

ALTER TABLE ops.ingest_run
  DROP CONSTRAINT IF EXISTS ingest_run_status_canonical;

ALTER TABLE ops.ingest_run
  ADD CONSTRAINT ingest_run_status_canonical
  CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT'))
  NOT VALID;
