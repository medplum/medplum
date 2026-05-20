// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { CreateTableCommand, GetTableCommand } from '@aws-sdk/client-s3tables';
import { ensureWarehouseHistoryIcebergTable } from './s3-tables-client';

describe('s3-tables-client ensureWarehouseHistoryIcebergTable', () => {
  test('returns skipped when table already exists', async () => {
    const send = jest.fn().mockResolvedValue({});
    const client = { send } as any;
    const result = await ensureWarehouseHistoryIcebergTable(
      client,
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
      'default',
      'patient_history'
    );
    expect(result).toBe('skipped');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetTableCommand);
  });

  test('creates table when GetTable returns NotFoundException', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'NotFoundException' });
    const send = jest.fn().mockRejectedValueOnce(notFound).mockResolvedValueOnce({});
    const client = { send } as any;
    const result = await ensureWarehouseHistoryIcebergTable(
      client,
      'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
      'default',
      'patient_history'
    );
    expect(result).toBe('created');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetTableCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(CreateTableCommand);
  });
});
