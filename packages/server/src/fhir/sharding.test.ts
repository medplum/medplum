// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { protectedResourceTypes } from '@medplum/core';
import { GlobalOnlyResourceTypes } from './sharding';

describe('GlobalOnlyResourceTypes', () => {
  test('should be exactly the protected resource types', () => {
    expect(GlobalOnlyResourceTypes).toEqual(new Set(protectedResourceTypes));
  });
});
