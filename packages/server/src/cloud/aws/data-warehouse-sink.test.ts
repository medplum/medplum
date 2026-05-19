// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { S3TablesWarehouseSink } from './data-warehouse-sink';

describe('data warehouse aws sink', () => {
  test('s3tables sink builds managed setup queries', () => {
    const sink = new S3TablesWarehouseSink('us-east-1', 'arn:aws:s3tables:us-east-1:123456789012:bucket/test');
    const queries = sink.getSetupQueries('postgresql://user:pass@localhost/db');
    expect(queries.join('\n')).toContain("CREATE SECRET ( TYPE S3, PROVIDER CREDENTIAL_CHAIN, REGION 'us-east-1' );");
    expect(queries.join('\n')).toContain("ATTACH 'arn:aws:s3tables:us-east-1:123456789012:bucket/test'");
    expect(queries.join('\n')).toContain('ENDPOINT_TYPE s3_tables');
  });
});
