// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ClientApplication } from '@medplum/fhirtypes';
import { getClientRedirectUri } from './clients';

describe('OAuth clients', () => {
  test('getClientRedirectUri', () => {
    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      id: 'test',
      redirectUris: ['https://example.com/callback', 'https://example.com/redirect'],
    };

    expect(getClientRedirectUri(client, 'https://example.com/callback')).toBe('https://example.com/callback');
    expect(getClientRedirectUri(client, 'https://example.com/redirect')).toBe('https://example.com/redirect');
    expect(getClientRedirectUri(client, 'https://example.com/other')).toBeUndefined();
    expect(getClientRedirectUri(client, 'https://malicious.com/callback')).toBeUndefined();

    // Partial matching is not recommended, but supported with the allowPartial flag
    expect(getClientRedirectUri(client, 'https://example.com/callback?param=value', true)).toBe(
      'https://example.com/callback?param=value'
    );
    expect(getClientRedirectUri(client, 'https://example.com/callback?param=value', false)).toBeUndefined();
    expect(getClientRedirectUri(client, 'https://example.com/other/path', true)).toBeUndefined();
  });

  test('getClientRedirectUri with deprecated redirectUri', () => {
    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      id: 'test',
      redirectUri: 'https://example.com/callback',
    };

    expect(getClientRedirectUri(client, 'https://example.com/callback')).toBe('https://example.com/callback');
    expect(getClientRedirectUri(client, 'https://example.com/other')).toBeUndefined();
    expect(getClientRedirectUri(client, 'https://malicious.com/callback')).toBeUndefined();

    // Partial matching is not recommended, but supported with the allowPartial flag
    expect(getClientRedirectUri(client, 'https://example.com/callback?param=value', true)).toBe(
      'https://example.com/callback?param=value'
    );
    expect(getClientRedirectUri(client, 'https://example.com/other/path', true)).toBeUndefined();
  });
});
