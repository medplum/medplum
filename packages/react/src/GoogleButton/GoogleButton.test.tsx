// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { locationUtils } from '@medplum/core';
import { getGoogleClientId } from './GoogleButton.utils';

describe('GoogleButton', () => {
  test('googleClientId', () => {
    expect(getGoogleClientId('foo')).toStrictEqual('foo');

    locationUtils.getOrigin = () => 'https://app.medplum.com';
    process.env.GOOGLE_AUTH_ORIGINS = 'https://app.medplum.com';
    process.env.GOOGLE_CLIENT_ID = 'foo';
    expect(getGoogleClientId(undefined)).toStrictEqual('foo');

    locationUtils.getOrigin = () => 'https://evil.com';
    expect(getGoogleClientId(undefined)).toBeUndefined();
  });
});
