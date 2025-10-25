// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { locationUtils } from '@medplum/core';

export function getGoogleClientId(clientId: string | undefined): string | undefined {
  if (clientId) {
    return clientId;
  }

  const origin = locationUtils.getOrigin();
  if (origin) {
    const authorizedOrigins = import.meta.env.GOOGLE_AUTH_ORIGINS?.split(',') ?? [];
    if (authorizedOrigins.includes(origin)) {
      return import.meta.env.GOOGLE_CLIENT_ID;
    }
  }

  return undefined;
}
