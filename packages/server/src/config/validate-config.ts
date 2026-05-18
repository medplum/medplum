// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumServerConfig } from './types';

export function validateDataWarehouseConfig(config: MedplumServerConfig): void {
  const dw = config.dataWarehouse;
  if (!dw?.enabled) {
    return;
  }

  if (!dw.cron?.trim()) {
    throw new Error('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  }

  const sink = dw.sink;
  if (sink === 'local') {
    if (!dw.localBasePath?.trim()) {
      throw new Error('dataWarehouse.localBasePath is required when dataWarehouse.sink is "local"');
    }
  } else if (sink === 's3tables') {
    if (!dw.awsS3TableArn?.trim()) {
      throw new Error('dataWarehouse.awsS3TableArn is required when dataWarehouse.sink is "s3tables"');
    }
    if (!dw.namespace?.trim()) {
      throw new Error('dataWarehouse.namespace is required when dataWarehouse.sink is "s3tables"');
    }
  } else {
    throw new Error('dataWarehouse.sink must be "s3tables" or "local"');
  }
}
