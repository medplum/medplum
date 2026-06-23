// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export function arrayify<T>(value: NonNullable<T> | NonNullable<T>[]): T[];
export function arrayify<T>(value: T | T[] | undefined): T[] | undefined;
export function arrayify<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) {
    return undefined;
  } else if (Array.isArray(value)) {
    return value;
  } else {
    return [value];
  }
}
