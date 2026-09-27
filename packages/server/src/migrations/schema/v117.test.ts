// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { PoolClient } from 'pg';
import { describe, expect, test, vi } from 'vitest';
import * as fns from '../migrate-functions';
import { run } from './v117';

describe('v117 migration', () => {
  test('is a no-op', async () => {
    const querySpy = vi.spyOn(fns, 'query');

    await run({} as PoolClient);

    expect(querySpy).not.toHaveBeenCalled();
  });
});
