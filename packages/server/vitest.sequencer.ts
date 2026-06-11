// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TestSpecification } from 'vitest/node';
import { BaseSequencer } from 'vitest/node';

/**
 * Matches the Jest custom sequencer: run seed.test.ts first, then alphabetical order.
 * Vitest's default sequencer orders by failure history and file size, which breaks test isolation.
 */
export default class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => {
      const aPath = a.moduleId;
      const bPath = b.moduleId;
      if (aPath.endsWith('seed.test.ts')) {
        return -1;
      }
      if (bPath.endsWith('seed.test.ts')) {
        return 1;
      }
      return aPath.localeCompare(bPath);
    });
  }
}
