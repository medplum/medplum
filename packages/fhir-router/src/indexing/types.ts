// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export type ArrayColumnPaddingConfig = {
  m: number;
  lambda: number;
  statisticsTarget: number;
};

export type ArrayColumnPaddingEntry =
  | { resourceType?: string[]; config: ArrayColumnPaddingConfig }
  | { resourceType?: string[]; config: ArrayColumnPaddingConfig }[];

export type IndexingConfig = {
  arrayColumnPadding?: Record<string, ArrayColumnPaddingEntry>;
};
