\c postgres

DROP DATABASE IF EXISTS medplum_test;
DROP DATABASE IF EXISTS medplum_test_shard_0;
DROP DATABASE IF EXISTS medplum_test_shard_1;
-- DROP OWNED BY medplum_test_readonly;

DROP USER IF EXISTS medplum_test_readonly;
CREATE USER medplum_test_readonly WITH PASSWORD 'medplum_test_readonly';


CREATE DATABASE medplum_test;
CREATE DATABASE medplum_test_shard_0;
CREATE DATABASE medplum_test_shard_1;

GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
GRANT ALL PRIVILEGES ON DATABASE medplum_test_shard_0 TO medplum;
GRANT ALL PRIVILEGES ON DATABASE medplum_test_shard_1 TO medplum;

GRANT CONNECT ON DATABASE medplum_test TO medplum_test_readonly;
GRANT CONNECT ON DATABASE medplum_test_shard_0 TO medplum_test_readonly;
GRANT CONNECT ON DATABASE medplum_test_shard_1 TO medplum_test_readonly;

\c medplum_test
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_test_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_test_readonly;

\c medplum_test_shard_0
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_test_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_test_readonly;

\c medplum_test_shard_1
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_test_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_test_readonly;
