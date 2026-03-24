\c postgres

CREATE USER medplum_test_readonly WITH PASSWORD 'medplum_test_readonly';

DROP DATABASE IF EXISTS medplum_test;
DROP DATABASE IF EXISTS medplum_test_shard_0;
DROP DATABASE IF EXISTS medplum_test_shard_1;

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
GRANT pg_read_all_data TO medplum_test_readonly;

\c medplum_test_shard_0
GRANT pg_read_all_data TO medplum_test_readonly;

\c medplum_test_shard_1
GRANT pg_read_all_data TO medplum_test_readonly;
