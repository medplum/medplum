\set ON_ERROR_STOP on
\c postgres

DROP DATABASE IF EXISTS medplum_test WITH (FORCE);
DROP DATABASE IF EXISTS medplum_test_shard_1 WITH (FORCE);

CREATE DATABASE medplum_test OWNER medplum;
CREATE DATABASE medplum_test_shard_1 OWNER medplum;

-- Roles are cluster-wide: create once, idempotently. pg_read_all_data covers every database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medplum_test_readonly') THEN
    CREATE ROLE medplum_test_readonly LOGIN PASSWORD 'medplum_test_readonly';
  END IF;
  IF NOT pg_has_role('medplum_test_readonly', 'pg_read_all_data', 'MEMBER') THEN
    GRANT pg_read_all_data TO medplum_test_readonly;
  END IF;
END
$$;
