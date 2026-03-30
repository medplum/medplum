// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { MedplumClient } from '@medplum/core';
import type { Bot, Bundle, CareTeam, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { expect, test, vi } from 'vitest';
import { handler } from './careteam-search';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = 'application/json';
const secrets = {};

const SNOMED = 'http://snomed.info/sct';
const LOCAL = 'http://example.com/roles';

const practitioners: Practitioner[] = [
  { resourceType: 'Practitioner', id: 'prac-jon', name: [{ given: ['Jon'], family: 'Snow' }] },
  { resourceType: 'Practitioner', id: 'prac-jane', name: [{ given: ['Jane'], family: 'Doe' }] },
  { resourceType: 'Practitioner', id: 'prac-bob', name: [{ given: ['Bob'], family: 'Jones' }] },
];

const patients: Patient[] = [
  { resourceType: 'Patient', id: 'pat-alpha', name: [{ given: ['Alpha'], family: 'Patient' }] },
  { resourceType: 'Patient', id: 'pat-beta', name: [{ given: ['Beta'], family: 'Patient' }] },
  { resourceType: 'Patient', id: 'pat-gamma', name: [{ given: ['Gamma'], family: 'Patient' }] },
];

const careTeams: CareTeam[] = [
  {
    resourceType: 'CareTeam',
    id: 'ct-1',
    status: 'active',
    subject: { reference: 'Patient/pat-alpha' },
    participant: [
      {
        role: [{ coding: [{ system: SNOMED, code: 'case-manager' }] }],
        member: { reference: 'Practitioner/prac-jon' },
      },
      {
        role: [{ coding: [{ system: SNOMED, code: 'physician' }] }],
        member: { reference: 'Practitioner/prac-jane' },
      },
    ],
  },
  {
    resourceType: 'CareTeam',
    id: 'ct-2',
    status: 'active',
    subject: { reference: 'Patient/pat-beta' },
    participant: [
      {
        role: [{ coding: [{ system: SNOMED, code: 'case-manager' }] }],
        member: { reference: 'Practitioner/prac-jon' },
      },
      {
        role: [{ coding: [{ system: SNOMED, code: 'nurse' }] }],
        member: { reference: 'Practitioner/prac-bob' },
      },
    ],
  },
  {
    resourceType: 'CareTeam',
    id: 'ct-3',
    status: 'active',
    subject: { reference: 'Patient/pat-gamma' },
    participant: [
      {
        role: [{ coding: [{ system: SNOMED, code: 'physician' }] }],
        member: { reference: 'Practitioner/prac-jon' },
      },
      {
        role: [{ coding: [{ system: SNOMED, code: 'case-manager' }] }],
        member: { reference: 'Practitioner/prac-jane' },
      },
    ],
  },
  {
    resourceType: 'CareTeam',
    id: 'ct-4',
    status: 'proposed',
    subject: { reference: 'Patient/pat-alpha' },
    participant: [
      {
        role: [{ coding: [{ system: LOCAL, code: 'case-manager' }] }],
        member: { reference: 'Practitioner/prac-bob' },
      },
    ],
  },
];

function buildMockMedplum(): MedplumClient {
  const searchResources = vi.fn().mockImplementation((resourceType: string, params: Record<string, string>) => {
    if (resourceType === 'Practitioner') {
      const nameQuery = params['name:contains']?.toLowerCase();
      if (!nameQuery) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        practitioners.filter((p) =>
          p.name?.some(
            (n) =>
              n.given?.some((g) => g.toLowerCase().includes(nameQuery)) || n.family?.toLowerCase().includes(nameQuery)
          )
        )
      );
    }
    if (resourceType === 'CareTeam') {
      const refs = (params['participant'] || '').split(',');
      const statusParam = params['status'] || 'active';
      return Promise.resolve(
        careTeams.filter(
          (ct) =>
            ct.status === statusParam &&
            ct.participant?.some((p) => p.member?.reference && refs.includes(p.member.reference))
        )
      );
    }
    if (resourceType === 'Patient') {
      const ids = (params['_id'] || '').split(',');
      return Promise.resolve(patients.filter((p) => p.id && ids.includes(p.id)));
    }
    return Promise.resolve([]);
  });
  return { searchResources } as unknown as MedplumClient;
}

function makeEvent(input: Record<string, string>): {
  bot: Reference<Bot>;
  input: Record<string, string>;
  contentType: string;
  secrets: Record<string, never>;
} {
  return { bot, input, contentType, secrets };
}

function getMatchedPatientIds(result: Bundle): string[] {
  return (result.entry ?? [])
    .filter((e) => e.search?.mode === 'match')
    .map((e) => (e.resource as Patient).id ?? '')
    .sort();
}

test('case-manager + jon returns Alpha and Beta', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'case-manager', 'member-name': 'jon' }))) as Bundle;
  expect(result.total).toBe(2);
  expect(getMatchedPatientIds(result)).toEqual(['pat-alpha', 'pat-beta']);
});

test('physician + jon returns Gamma', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'physician', 'member-name': 'jon' }))) as Bundle;
  expect(result.total).toBe(1);
  expect(getMatchedPatientIds(result)).toEqual(['pat-gamma']);
});

test('case-manager + jane returns Gamma', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'case-manager', 'member-name': 'jane' }))) as Bundle;
  expect(result.total).toBe(1);
  expect(getMatchedPatientIds(result)).toEqual(['pat-gamma']);
});

test('physician + jane returns Alpha', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'physician', 'member-name': 'jane' }))) as Bundle;
  expect(result.total).toBe(1);
  expect(getMatchedPatientIds(result)).toEqual(['pat-alpha']);
});

test('No matching practitioners returns empty Bundle', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'case-manager', 'member-name': 'xyz' }))) as Bundle;
  expect(result.total).toBe(0);
  expect(result.entry).toEqual([]);
});

test('No matching role returns empty Bundle', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'surgeon', 'member-name': 'jon' }))) as Bundle;
  expect(result.total).toBe(0);
  expect(result.entry).toEqual([]);
});

test('role-system filters by coding system', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(
    medplum,
    makeEvent({ role: 'case-manager', 'member-name': 'jon', 'role-system': LOCAL })
  )) as Bundle;
  expect(result.total).toBe(0);
});

test('role-system matching SNOMED returns results', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(
    medplum,
    makeEvent({ role: 'case-manager', 'member-name': 'jon', 'role-system': SNOMED })
  )) as Bundle;
  expect(result.total).toBe(2);
  expect(getMatchedPatientIds(result)).toEqual(['pat-alpha', 'pat-beta']);
});

test('status=proposed searches non-active CareTeams', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(
    medplum,
    makeEvent({ role: 'case-manager', 'member-name': 'bob', status: 'proposed' })
  )) as Bundle;
  expect(result.total).toBe(1);
  expect(getMatchedPatientIds(result)).toEqual(['pat-alpha']);
});

test('Default status=active excludes proposed CareTeams', async () => {
  const medplum = buildMockMedplum();
  const result = (await handler(medplum, makeEvent({ role: 'case-manager', 'member-name': 'bob' }))) as Bundle;
  expect(result.total).toBe(0);
});

test('Missing role throws OperationOutcomeError', async () => {
  const medplum = buildMockMedplum();
  await expect(handler(medplum, makeEvent({ 'member-name': 'jon' }))).rejects.toThrow(OperationOutcomeError);
});

test('Missing member-name throws OperationOutcomeError', async () => {
  const medplum = buildMockMedplum();
  await expect(handler(medplum, makeEvent({ role: 'case-manager' }))).rejects.toThrow(OperationOutcomeError);
});
