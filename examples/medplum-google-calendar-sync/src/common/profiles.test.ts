// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { validateResource } from '@medplum/core';
import type { Basic, Slot, StructureDefinition } from '@medplum/fhirtypes';
import { expect, test } from 'vitest';
import { DEFINITIONS, PROFILES } from './profiles';
import { withState } from './state';
import { GOOGLE_CALENDAR_NAMESPACE as N, IMPORT_IDENTIFIER_SYSTEM } from './constants';
const profile = (url: string): StructureDefinition => DEFINITIONS.find((d) => d.url === url) as StructureDefinition;
const connection: Basic = {
  resourceType: 'Basic',
  meta: { profile: [PROFILES.connection] },
  code: { coding: [{ system: N, code: 'calendar-connection' }] },
  subject: { reference: 'Practitioner/p' },
  identifier: [
    { system: `${N}/connection`, value: 'Practitioner/p' },
    { system: 'https://accounts.google.com', value: 'sub' },
  ],
  extension: [{ url: `${N}/status`, valueCode: 'active' }],
};
test('connection profile rejects missing identity, tokens, duplicate status and unsupported modes', () => {
  const options = { profile: profile(PROFILES.connection) };
  expect(() => validateResource(connection, options)).not.toThrow();
  for (const resource of [
    { ...connection, extension: [{ url: `${N}/status`, valueString: 'active' }] },
    {
      ...connection,
      extension: [
        ...(connection.extension ?? []),
        { url: `${N}/sync-state`, extension: [{ url: 'inboundRequest', valueBoolean: true }] },
      ],
    },
    { ...connection, identifier: [] },
    {
      ...connection,
      extension: [...(connection.extension ?? []), { url: `${N}/refresh-token`, valueString: 'secret' }],
    },
    { ...connection, extension: [...(connection.extension ?? []), { url: `${N}/status`, valueCode: 'active' }] },
    {
      ...connection,
      extension: [...(connection.extension ?? []), { url: `${N}/event-detail-level`, valueCode: 'full-with-invite' }],
    },
  ]) {
    expect(() => validateResource(resource, options)).toThrow();
  }
});
test('imported Slot profile requires identity, blocks and a valid interval', () => {
  const slot: Slot = {
    resourceType: 'Slot',
    meta: { profile: [PROFILES.slot] },
    identifier: [{ system: IMPORT_IDENTIFIER_SYSTEM, value: 'v1.identity' }],
    schedule: { reference: 'Schedule/s' },
    status: 'busy-unavailable',
    start: '2026-11-01T10:00:00Z',
    end: '2026-11-01T11:00:00Z',
  };
  const options = { profile: profile(PROFILES.slot) };
  expect(() => validateResource(slot, options)).not.toThrow();
  expect(() => validateResource({ ...slot, identifier: [] }, options)).toThrow();
  expect(() => validateResource({ ...slot, end: slot.start }, options)).toThrow();
  expect(() => validateResource({ ...slot, status: 'free' }, options)).toThrow();
  expect(() => validateResource({ ...slot, comment: 'private Google title' }, options)).toThrow();
});
test.each(['credential', 'settings', 'mirror'] as const)('%s profile validates its own bookkeeping shape', (name) => {
  const resource: Basic = {
    resourceType: 'Basic',
    code: { coding: [{ system: N, code: `calendar-${name}` }] },
    identifier: [{ system: `${N}/${name}`, value: name === 'settings' ? 'Project/p' : 'Basic/connection' }],
    subject: { reference: name === 'mirror' ? 'Basic/connection' : 'Practitioner/p' },
    extension: [],
  };
  if (name === 'credential') {
    resource.identifier?.push({ system: 'https://accounts.google.com', value: 'sub' });
    resource.extension?.push({ url: `${N}/refresh-token`, valueString: 'token' });
  }
  if (name === 'settings') {
    resource.extension?.push({ url: `${N}/project-detail-level`, valueCode: 'busy-only' });
  }
  const options = { profile: profile(PROFILES[name]) };
  expect(() => validateResource(resource, options)).not.toThrow();
  expect(() => validateResource({ ...resource, identifier: [] }, options)).toThrow();
});

test('empty sync state omits the invalid empty FHIR extension', () => {
  const resource = withState(connection, { channels: [], conflicts: [] });
  expect(resource.extension?.some((e) => e.url === `${N}/sync-state`)).toBe(false);
  expect(() => validateResource(resource, { profile: profile(PROFILES.connection) })).not.toThrow();
});
