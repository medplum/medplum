// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from '@medplum/core';

export function getServerVersion(): string {
  return MEDPLUM_VERSION.split('-')[0];
}
