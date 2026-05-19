// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import pgConnectionString from 'pg-connection-string';
import {
  DEFAULT_DW_DATABASE_STATEMENT_TIMEOUT,
  appendMedplumDatabaseSslSearchParams,
  buildPgConnectionURI,
  toIcebergTableName,
} from './config';

describe('buildPostgresConnectionUriFromMedplumDatabaseConfig', () => {
  test('builds a PostgreSQL URI with default statement_timeout', () => {
    const uri = buildPgConnectionURI({
      host: 'db.example.com',
      port: 5432,
      dbname: 'medplum',
      username: 'medplum',
      password: 'secret',
    });
    const parsed = new URL(uri);
    expect(parsed.protocol).toBe('postgresql:');
    expect(parsed.hostname).toBe('db.example.com');
    expect(parsed.port).toBe('5432');
    expect(parsed.pathname).toBe('/medplum');
    expect(parsed.username).toBe('medplum');
    expect(parsed.password).toBe('secret');
    expect(parsed.searchParams.get('options')).toBe(`-c statement_timeout=${DEFAULT_DW_DATABASE_STATEMENT_TIMEOUT}`);
  });

  test('uses custom queryTimeout in options', () => {
    const uri = buildPgConnectionURI({
      host: 'db.example.com',
      dbname: 'medplum',
      username: 'medplum',
      password: 'secret',
      queryTimeout: 3000,
    });
    expect(new URL(uri).searchParams.get('options')).toBe('-c statement_timeout=3000');
  });

  test('percent-encodes special characters in password', () => {
    const uri = buildPgConnectionURI({
      host: 'db.example.com',
      dbname: 'medplum',
      username: 'user@domain',
      password: "p'a s@word",
    });
    const parsed = pgConnectionString.parse(uri);
    expect(parsed.user).toBe('user@domain');
    expect(parsed.password).toBe("p'a s@word");
    expect(uri).toContain('user%40domain');
  });

  test('throws when required fields are missing', () => {
    expect(() =>
      buildPgConnectionURI({
        host: 'db.example.com',
        dbname: 'medplum',
        username: 'medplum',
      })
    ).toThrow('Missing required database configuration');
  });
});

describe('appendMedplumDatabaseSslSearchParams', () => {
  test('sets sslmode=require when ssl.require is true', () => {
    const params = new URLSearchParams();
    appendMedplumDatabaseSslSearchParams(params, { require: true });
    expect(params.get('sslmode')).toBe('require');
  });

  test('sets verify-full with sslrootcert when rejectUnauthorized and ca are set', () => {
    const params = new URLSearchParams();
    appendMedplumDatabaseSslSearchParams(params, {
      rejectUnauthorized: true,
      ca: '/path/to/ca.pem',
      cert: '/path/to/client.crt',
      key: '/path/to/client.key',
    });
    expect(params.get('sslmode')).toBe('verify-full');
    expect(params.get('sslrootcert')).toBe('/path/to/ca.pem');
    expect(params.get('sslcert')).toBe('/path/to/client.crt');
    expect(params.get('sslkey')).toBe('/path/to/client.key');
  });

  test('encodes cert paths with spaces in URI', () => {
    const uri = buildPgConnectionURI({
      host: 'db.example.com',
      dbname: 'medplum',
      username: 'medplum',
      password: 'secret',
      ssl: { require: true, cert: '/path/with spaces/client.crt' },
    });
    const parsed = new URL(uri);
    expect(parsed.searchParams.get('sslcert')).toBe('/path/with spaces/client.crt');
    expect(uri).toContain('sslcert=%2Fpath%2Fwith%20spaces%2Fclient.crt');
  });
});

describe('toIcebergTableName', () => {
  test.each([
    ['Patient_History', 'patient_history'],
    ['serviceRequest_history', 'servicerequest_history'],
    ['AuditEvent_History', 'auditevent_history'],
    ['NotAType_history', 'notatype_history'],
    ['already_snake_case', 'already_snake_case'],
  ])('normalizes "%s" to "%s"', (input, expected) => {
    expect(toIcebergTableName(input)).toBe(expected);
  });
});
