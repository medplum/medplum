DROP DATABASE IF EXISTS medplum_e2e;
CREATE DATABASE medplum_e2e;
GRANT ALL PRIVILEGES ON DATABASE medplum_e2e TO medplum;

\c medplum_e2e

CREATE USER medplum_e2e_readonly WITH PASSWORD 'medplum_e2e_readonly';
GRANT CONNECT ON DATABASE medplum_e2e TO medplum_e2e_readonly;
GRANT USAGE ON SCHEMA public TO medplum_e2e_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO medplum_e2e_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO medplum_e2e_readonly;