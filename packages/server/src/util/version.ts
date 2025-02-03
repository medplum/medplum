import { MEDPLUM_VERSION } from '@medplum/core';

export function getServerVersion(): string {
  return MEDPLUM_VERSION.split('-')[0];
}
