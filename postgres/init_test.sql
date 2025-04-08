DROP DATABASE IF EXISTS medplum_test;
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;

DROP DATABASE IF EXISTS medplum_test_shard_0;
CREATE DATABASE medplum_test_shard_0;
GRANT ALL PRIVILEGES ON DATABASE medplum_test_shard_0 TO medplum;

DROP DATABASE IF EXISTS medplum_test_shard_1;
CREATE DATABASE medplum_test_shard_1;
GRANT ALL PRIVILEGES ON DATABASE medplum_test_shard_1 TO medplum;

\c medplum_test

CREATE USER medplum_test_readonly WITH PASSWORD 'medplum_test_readonly';
GRANT CONNECT ON DATABASE medplum_test TO medplum_test_readonly;
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_test_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_test_readonly;

\c medplum_test_shard_0

CREATE USER medplum_test_readonly WITH PASSWORD 'medplum_test_readonly';
GRANT CONNECT ON DATABASE medplum_test_shard_0 TO medplum_test_readonly;
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_test_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_test_readonly;

\c medplum_test_shard_1

CREATE USER medplum_test_readonly WITH PASSWORD 'medplum_test_readonly';
GRANT CONNECT ON DATABASE medplum_test_shard_1 TO medplum_test_readonly;
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_test_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_test_readonly;
