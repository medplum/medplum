// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { categories } from './ratelimit';

describe('Rate limit categories', () => {
  // Request paths are lowercased before matching, so a mixed-case path would never match
  test.each(categories.map((c) => [c.name, [...(c.paths ?? []), ...(c.prefixes ?? []), ...(c.excludedPaths ?? [])]]))(
    '%s paths are lowercase',
    (_name, paths) => {
      for (const path of paths) {
        expect(path).toBe(path.toLowerCase());
      }
    }
  );
});
