// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
const clientId = crypto.randomUUID();

export function useClientId(): string {
  return clientId;
}
