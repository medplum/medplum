\c postgres

DROP DATABASE IF EXISTS medplum_test;
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;

\c medplum_test

CREATE USER medplum_test_readonly WITH PASSWORD 'medplum_test_readonly';
GRANT CONNECT ON DATABASE medplum_test TO medplum_test_readonly;
GRANT USAGE ON SCHEMA public TO medplum_test_readonly;
GRANT pg_read_all_data TO medplum_test_readonly;
