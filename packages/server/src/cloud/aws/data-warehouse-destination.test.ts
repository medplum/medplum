// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { S3TablesWarehouseDestination } from './data-warehouse-destination';

describe('data warehouse aws destination', () => {
  test('s3tables destination builds managed setup queries', () => {
    const destination = new S3TablesWarehouseDestination(
      'us-east-1',
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test'
    );
    const queries = destination.getSetupQueries('postgresql://user:pass@localhost/db');
    expect(queries.join('\n')).toContain("CREATE SECRET ( TYPE S3, PROVIDER CREDENTIAL_CHAIN, REGION 'us-east-1' )");
    expect(queries.join('\n')).toContain("ATTACH 'arn:aws:s3tables:us-east-1:123456789012:bucket/test'");
    expect(queries.join('\n')).toContain('ENDPOINT_TYPE s3_tables');
  });
});
