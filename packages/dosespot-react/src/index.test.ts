// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useDoseSpotIFrame, useDoseSpotNotifications } from '.';

describe('Index', () => {
  test('Expected exports', () => {
    expect(useDoseSpotIFrame).toBeDefined();
    expect(useDoseSpotNotifications).toBeDefined();
  });
});
