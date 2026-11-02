// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { readJson } from '@medplum/definitions';
import type { Bundle, CodeSystem, StructureDefinition, ValueSet } from '@medplum/fhirtypes';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { IMPORT_IDENTIFIER_SYSTEM, GOOGLE_CALENDAR_NAMESPACE as N } from '../common/constants';
const base = 'https://medplum.com/profiles/integrations/google-calendar';
const bundle = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
const types = readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>;
const files: (StructureDefinition | CodeSystem | ValueSet)[] = [];
const modes = ['busy-only', 'initials', 'full'];
const statuses = ['active', 'reauth-required', 'disconnecting'];
for (const [name, codes] of [
  ['detail-level', modes],
  ['connection-status', statuses],
] as const) {
  const system = `${base}/CodeSystem/${name}`;
  files.push({
    resourceType: 'CodeSystem',
    url: system,
    name: name.replaceAll('-', ''),
    status: 'active',
    content: 'complete',
    caseSensitive: true,
    concept: codes.map((code) => ({ code })),
  });
  files.push({
    resourceType: 'ValueSet',
    url: `${base}/ValueSet/${name}`,
    name: name.replaceAll('-', ''),
    status: 'active',
    compose: { include: [{ system, concept: codes.map((code) => ({ code })) }] },
  });
}
const ext = (url: string): string => `extension.where(url='${N}/${url}')`;
const code = (name: string, codes: readonly string[], required = true): string =>
  `${ext(name)}.count() ${required ? '=' : '<='} 1 and ${ext(name)}.all((value is code) and (${codes.map((c) => `valueCode = '${c}'`).join(' or ')}))`;
const identity = (system: string): string =>
  `identifier.where(system='${system}').count() = 1 and identifier.where(system='${system}').value.exists()`;
const stateField = (name: string, type: string): string => {
  const path = `${ext('sync-state')}.extension.where(url='${name}')`;
  return `${path}.count() <= 1 and ${path}.all(value is ${type.toLowerCase()})`;
};
const stateConstraints = [
  `${ext('sync-state')}.count() <= 1`,
  `${ext('worker-lease')}.count() <= 1 and ${ext('worker-lease')}.all(extension.where(url='owner').count() = 1 and extension.where(url='owner').all(value is string) and extension.where(url='expires').count() = 1 and extension.where(url='expires').all(value is instant))`,
  ...[
    'inboundRequest',
    'outboundRequest',
    'inboundCompleted',
    'outboundCompleted',
    'staleReason',
    'inboundError',
    'outboundError',
    'conflictsRevision',
    'cleanupIssue',
  ].map((name) => stateField(name, 'String')),
  ...[
    'lastInbound',
    'lastOutbound',
    'inboundRetryAt',
    'outboundRetryAt',
    'requestedRangeStart',
    'requestedRangeEnd',
  ].map((name) => stateField(name, 'Instant')),
  ...[
    'privacyPending',
    'forgetRevoked',
    'googleCleaned',
    'slotsCleaned',
    'credentialRevoked',
    'statusPublishPending',
  ].map((name) => stateField(name, 'Boolean')),
  `${ext('sync-state')}.extension.where(url='projectDetailLevel').count() <= 1 and ${ext('sync-state')}.extension.where(url='projectDetailLevel').all((value is code) and (valueCode = 'busy-only' or valueCode = 'initials' or valueCode = 'full'))`,
];
const scalar = (name: string, type: string): string =>
  `${ext(name)}.count() <= 1 and ${ext(name)}.all((value is ${type}) and extension.empty())`;
const allowed = (names: string[]): string =>
  `extension.all(${names.map((name) => `url = '${N}/${name}'`).join(' or ')})`;
const publicFields = [
  'lastInbound',
  'lastOutbound',
  'staleReason',
  'inboundError',
  'outboundError',
  'cleanupIssue',
  'privacyPending',
  'projectDetailLevel',
  'conflictsRevision',
  'inboundRequest',
  'outboundRequest',
];
const utc = (path: string): string =>
  `${path}.toString().matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$')`;
const work = `${ext('sync-state')}.extension.where(url='outboundWork')`;
stateConstraints.push(
  `${work}.count() <= 1 and ${work}.all(value.empty() and extension.where(url='phase').count() = 1 and extension.where(url='phase').all((value is code) and (valueCode = 'discover' or valueCode = 'repair')) and extension.where(url='start').count() = 1 and extension.where(url='start').all(value is instant) and extension.where(url='end').count() = 1 and extension.where(url='end').all(value is instant) and ${utc("extension.where(url='start').value")} and ${utc("extension.where(url='end').value")} and extension.where(url='start').value < extension.where(url='end').value)`
);
const requestedStart = `${ext('sync-state')}.extension.where(url='requestedRangeStart').value`;
const requestedEnd = `${ext('sync-state')}.extension.where(url='requestedRangeEnd').value`;
stateConstraints.push(
  `(${requestedStart}.empty() and ${requestedEnd}.empty()) or (${requestedStart}.exists() and ${requestedEnd}.exists() and ${utc(requestedStart)} and ${utc(requestedEnd)} and ${requestedStart} < ${requestedEnd})`
);
const specs: [string, 'Basic' | 'Slot', string[]][] = [
  [
    'public-status',
    'Basic',
    [
      "subject.reference.matches('^Practitioner/[A-Za-z0-9.-]+$')",
      identity(`${N}/public-status`),
      `identifier.where(system='${N}/public-status').value.matches('^Basic/[A-Za-z0-9.-]+$')`,
      allowed(['status', 'account-email', 'event-detail-level', 'sync-state']),
      scalar('account-email', 'string'),
      code('event-detail-level', modes, false),
      ...stateConstraints,
      `${ext('sync-state')}.all(value.empty() and extension.all(${publicFields.map((name) => `url = '${name}'`).join(' or ')}))`,
      code('status', statuses),
      `${ext('refresh-token')}.empty()`,
      `${ext('worker-lease')}.empty()`,
      `${ext('sync-state')}.extension.where(url='conflict' or url='channel' or url='outboundWork').empty()`,
    ],
  ],
  [
    'connection',
    'Basic',
    [
      "subject.reference.matches('^Practitioner/[A-Za-z0-9.-]+$')",
      identity(`${N}/connection`),
      `identifier.where(system='${N}/connection').value = subject.reference`,
      scalar('account-email', 'string'),
      identity('https://accounts.google.com'),
      code('status', statuses),
      code('event-detail-level', modes, false),
      `${ext('refresh-token')}.empty()`,
      ...stateConstraints,
    ],
  ],
  [
    'credential',
    'Basic',
    [
      "subject.reference.matches('^Practitioner/[A-Za-z0-9.-]+$')",
      identity(`${N}/credential`),
      identity('https://accounts.google.com'),
      `${ext('refresh-token')}.count() = 1 and ${ext('refresh-token')}.all(value is string)`,
    ],
  ],
  [
    'settings',
    'Basic',
    [
      identity(`${N}/settings`),
      code('project-detail-level', modes),
      allowed(['project-detail-level']),
      'subject.empty()',
    ],
  ],
  ['mirror', 'Basic', ["subject.reference.startsWith('Basic/')", identity(`${N}/mirror`)]],
  [
    'imported-slot',
    'Slot',
    [
      identity(IMPORT_IDENTIFIER_SYSTEM),
      `identifier.where(system='${IMPORT_IDENTIFIER_SYSTEM}').value.startsWith('v1.')`,
      "status = 'busy-unavailable'",
      'serviceType.empty()',
      'comment.empty()',
      utc('start'),
      utc('end'),
      'start < end',
      "schedule.reference.startsWith('Schedule/')",
    ],
  ],
];
for (const [name, type, constraints] of specs) {
  const original = bundle.entry?.find(
    (e) => e.resource?.type === type && e.resource?.derivation === 'specialization'
  )?.resource;
  if (!original?.snapshot) {
    throw new Error(`Missing base ${type}`);
  }
  const snapshot = structuredClone(original.snapshot);
  snapshot.element[0].constraint = [
    ...(snapshot.element[0].constraint ?? []),
    ...constraints.map((expression, i) => ({
      key: `gcal-${name}-${i}`,
      severity: 'error' as const,
      human: `Google Calendar ${name} constraint ${i + 1}`,
      expression,
    })),
  ];
  if (type === 'Basic') {
    snapshot.element[0].constraint.push({
      key: `gcal-${name}-code`,
      severity: 'error' as const,
      human: 'Expected integration bookkeeping code',
      expression: `code.coding.count() = 1 and code.coding.where(system='${N}' and code='calendar-${name}').exists()`,
    });
  }
  for (const path of type === 'Basic' ? ['identifier', ...(name === 'settings' ? [] : ['subject'])] : ['identifier']) {
    const element = snapshot.element.find((e) => e.path === `${type}.${path}`);
    if (element) {
      element.min = 1;
    }
  }
  files.push({
    resourceType: 'StructureDefinition',
    url: `${base}/${name}`,
    name: `GoogleCalendar${name.replaceAll('-', '')}`,
    status: name === 'credential' ? 'draft' : 'active',
    fhirVersion: '4.0.1',
    kind: 'resource',
    abstract: false,
    type,
    baseDefinition: `http://hl7.org/fhir/StructureDefinition/${type}`,
    derivation: 'constraint',
    snapshot,
  });
}
const extensions = [
  ['account-email', 'string'],
  ['refresh-token', 'string'],
  ['status', 'code'],
  ['event-detail-level', 'code'],
  ['project-detail-level', 'code'],
  ['worker-lease', undefined],
  ['sync-state', undefined],
  ['invalid-outbound-checkpoint', undefined],
] as const;
for (const [name, type] of extensions) {
  const original = types.entry?.find((e) => e.resource?.type === 'Extension')?.resource;
  if (!original?.snapshot) {
    throw new Error('Missing Extension');
  }
  const snapshot = structuredClone(original.snapshot);
  const url = snapshot.element.find((e) => e.path === 'Extension.url');
  const value = snapshot.element.find((e) => e.path === 'Extension.value[x]');
  const child = snapshot.element.find((e) => e.path === 'Extension.extension');
  if (url) {
    url.fixedUri = `${N}/${name}`;
  }
  if (value) {
    value.min = type ? 1 : 0;
    value.max = type ? '1' : '0';
    if (type) {
      value.type = [{ code: type }];
    }
  }
  if (child) {
    child.min = type ? 0 : 1;
    child.max = type ? '0' : '*';
  }
  if (value && type === 'code') {
    value.binding = {
      strength: 'required',
      valueSet: `${base}/ValueSet/${name === 'status' ? 'connection-status' : 'detail-level'}`,
    };
  }
  files.push({
    resourceType: 'StructureDefinition',
    url: `${N}/${name}`,
    name: `GoogleCalendar${name.replaceAll('-', '')}Extension`,
    status: name === 'refresh-token' ? 'draft' : 'active',
    fhirVersion: '4.0.1',
    kind: 'complex-type',
    abstract: false,
    type: 'Extension',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Extension',
    derivation: 'constraint',
    context: [{ type: 'element', expression: 'Basic' }],
    snapshot,
  });
}
mkdirSync('profiles', { recursive: true });
const serialized = await format(JSON.stringify(files), {
  ...(await resolveConfig('profiles/definitions.json')),
  filepath: 'profiles/definitions.json',
});
if (process.argv.includes('--check')) {
  if (readFileSync('profiles/definitions.json', 'utf8') !== serialized) {
    throw new Error('Profile definitions are stale; run npm run profiles');
  }
} else {
  writeFileSync('profiles/definitions.json', serialized);
}
