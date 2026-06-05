// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ILogger } from '@medplum/core';
import isISO8601 from 'validator/lib/isISO8601.js';
import { getWarehouseSyncPostgresTableNames } from '../data-warehouse/config';
import { globalLogger } from '../logger';
import type { MedplumDataWarehouseConfig, MedplumServerConfig } from './types';

function getConfiguredDataWarehouseResourceTypes(dw: MedplumDataWarehouseConfig): string[] {
  return [...(dw.includeResourceTypes ?? []), ...(dw.excludeResourceTypes ?? [])];
}

function hasDataWarehouseIncludeAndExclude(dw: MedplumDataWarehouseConfig): boolean {
  return !!dw.includeResourceTypes?.length && !!dw.excludeResourceTypes?.length;
}

/**
 * Returns configuration errors for data warehouse sync when `dataWarehouse.enabled` is true.
 * Returns an empty array when sync is disabled or configuration is valid.
 * @param config - The server configuration to validate.
 * @returns A list of human-readable configuration error messages.
 */
export function getDataWarehouseConfigErrors(config: MedplumServerConfig): string[] {
  const dw = config.dataWarehouse;
  if (!dw?.enabled) {
    return [];
  }

  const errors: string[] = [];

  if (!dw.cron?.trim()) {
    errors.push('dataWarehouse.cron is required when dataWarehouse.enabled is true');
  }

  const destination = dw.destination;
  if (destination === 'local') {
    if (!dw.localBasePath?.trim()) {
      errors.push('dataWarehouse.localBasePath is required when dataWarehouse.destination is "local"');
    }
  } else if (destination === 's3tables') {
    if (!dw.awsS3TableArn?.trim()) {
      errors.push('dataWarehouse.awsS3TableArn is required when dataWarehouse.destination is "s3tables"');
    }
    if (!dw.namespace?.trim()) {
      errors.push('dataWarehouse.namespace is required when dataWarehouse.destination is "s3tables"');
    }
  } else {
    errors.push('dataWarehouse.destination must be "s3tables" or "local"');
  }

  if (dw.startDate && !isISO8601(dw.startDate)) {
    errors.push('dataWarehouse.startDate must be a valid ISO 8601 timestamp');
  }

  if (hasDataWarehouseIncludeAndExclude(dw)) {
    errors.push('dataWarehouse.includeResourceTypes and dataWarehouse.excludeResourceTypes cannot both be set');
  }

  const configuredResourceTypes = getConfiguredDataWarehouseResourceTypes(dw);
  if (configuredResourceTypes.length > 0) {
    const knownTableNames = new Set(getWarehouseSyncPostgresTableNames());
    if (knownTableNames.size > 0) {
      const unknownResourceTypes = configuredResourceTypes.filter(
        (resourceType) => !knownTableNames.has(`${resourceType}_History`)
      );
      if (unknownResourceTypes.length > 0) {
        errors.push(
          `dataWarehouse resource type filter contains unknown resource type(s): ${unknownResourceTypes.join(', ')}`
        );
      }
    }
  }

  return errors;
}

/**
 * True when data warehouse sync is enabled and all required settings are present.
 * @param config - The server configuration to check.
 * @returns Whether the data warehouse sync worker and scheduler may run.
 */
export function isDataWarehouseSyncOperational(config: MedplumServerConfig): boolean {
  return !!config.dataWarehouse?.enabled && getDataWarehouseConfigErrors(config).length === 0;
}

/**
 * Logs a warning when data warehouse sync is enabled but configuration is invalid.
 * Does not throw; the server may start without registering the sync worker.
 * @param config - The server configuration to validate.
 * @param logger - Logger used for the warning message.
 */
export function warnInvalidDataWarehouseConfig(config: MedplumServerConfig, logger: ILogger = globalLogger): void {
  const errors = getDataWarehouseConfigErrors(config);
  if (errors.length === 0) {
    return;
  }

  logger.warn('Data warehouse sync is enabled but configuration is invalid; sync worker will not start', {
    errors,
  });
}
