// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export const SqlDialect = {
  POSTGRES: 'postgres',
  SQLITE: 'sqlite',
} as const;

export type SqlDialect = (typeof SqlDialect)[keyof typeof SqlDialect];
