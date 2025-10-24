// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MEDPLUM_VERSION } from '@medplum/core';
import { getServerVersion } from './version';

test('getServerVersion', () => {
  expect(getServerVersion()).toEqual(MEDPLUM_VERSION.split('-')[0]);
});
