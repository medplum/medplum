// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export function getInitials(input: string): string {
  const words = input.split(' ').filter(Boolean);
  if (words.length > 1) {
    return words[0][0] + words.at(-1)?.at(0);
  }
  if (words.length === 1) {
    return words[0][0];
  }
  return '';
}
