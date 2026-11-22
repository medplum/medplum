// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import type { WithId } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type {
  Bot,
  Bundle,
  Encounter,
  Location,
  Organization,
  Patient,
  Practitioner,
  Reference,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SandataClient, SandataEmployee, SandataVisit } from './sandata-evv';
import { EXAMPLE_CONFIG, handler } from './submit-visit-to-sandata';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;
const secrets = {
  SANDATA_BASE_URL: { name: 'SANDATA_BASE_URL', valueString: 'https://uat-api.sandata.com/interfaces/intake' },
  SANDATA_USERNAME: { name: 'SANDATA_USERNAME', valueString: 'user' },
  SANDATA_PASSWORD: { name: 'SANDATA_PASSWORD', valueString: 'secret' },
  SANDATA_ACCOUNT: { name: 'SANDATA_ACCOUNT', valueString: '12345' },
  SANDATA_POLL_DELAY_MS: { name: 'SANDATA_POLL_DELAY_MS', valueString: '0' },
};

const CLOCK_IN = '2026-11-23T15:02:13.482Z';
const CLOCK_OUT = '2026-11-23T16:58:40.105Z';

interface SentRecords {
  employees: SandataEmployee[];
  clients: SandataClient[];
  visits: SandataVisit[];
}

/**
 * A fake Sandata intake API. POSTs are acknowledged with a UUID; status checks report success, or the
 * configured rejection for a record type.
 * @param rejections - Error messages to return from the status check, by record type.
 * @returns The records received, by type.
 */
function fakeSandata(rejections: Partial<Record<keyof SentRecords, string>> = {}): SentRecords {
  const sent: SentRecords = { employees: [], clients: [], visits: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const type = /intake\/(employees|clients|visits)\//.exec(url)?.[1] as keyof SentRecords;
      let body: object;
      if (init.method === 'POST') {
        sent[type].push(...(JSON.parse(init.body as string) as never[]));
        body = {
          id: `${type}-uuid`,
          status: 'SUCCESS',
          messageSummary: 'The result for the input UUID is not ready yet. Please try again.',
          data: { uuid: `${type}-uuid`, account: '12345', reason: 'Transaction Received.' },
        };
      } else if (rejections[type]) {
        body = {
          id: `${type}-uuid`,
          status: 'SUCCESS',
          messageSummary: '[1] Records uploaded, please check errors/warnings and try again.',
          data: [{ ...sent[type][0], ErrorCode: '-100', ErrorMessage: rejections[type] }],
        };
      } else {
        body = { id: `${type}-uuid`, status: 'SUCCESS', messageSummary: 'All records updated successfully.' };
      }
      return { ok: true, status: 200, json: async () => body };
    })
  );
  return sent;
}

describe('submit-visit-to-sandata', () => {
  let medplum: MockClient;
  let agency: WithId<Organization>;
  let patient: WithId<Patient>;
  let caregiver: WithId<Practitioner>;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
    agency = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Example Home Care',
      identifier: [{ system: EXAMPLE_CONFIG.provider.identifierSystem, value: '123456789' }],
    });
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Robert', 'Lee'], family: 'Johnson' }],
      identifier: [{ system: EXAMPLE_CONFIG.client.identifierSystem, value: '0012345678' }],
      address: [{ use: 'home', line: ['12 Main St'], city: 'Providence', state: 'RI', postalCode: '02903' }],
    });
    caregiver = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['Alice'], family: 'Caregiver' }],
      identifier: [{ system: EXAMPLE_CONFIG.employee.identifierSystem, value: '123-45-6789' }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function clockEvent(code: 'clock-in' | 'clock-out', withGps = true): Promise<WithId<Location>> {
    return medplum.createResource<Location>({
      resourceType: 'Location',
      mode: 'instance',
      type: [{ coding: [{ system: EXAMPLE_CONFIG.visitEventSystem, code }] }],
      position: withGps ? { latitude: 41.8236, longitude: -71.4222 } : undefined,
    });
  }

  async function finishedVisit(options: { gps?: boolean } = {}): Promise<WithId<Encounter>> {
    const clockIn = await clockEvent('clock-in', options.gps ?? true);
    const clockOut = await clockEvent('clock-out', options.gps ?? true);
    const encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'HH' },
      type: [{ coding: [{ system: EXAMPLE_CONFIG.serviceCodeSystem, code: 'personal-care' }] }],
      subject: createReference(patient),
      participant: [{ individual: createReference(caregiver) }],
      serviceProvider: createReference(agency),
      period: { start: CLOCK_IN, end: CLOCK_OUT },
      location: [
        { location: createReference(clockIn), period: { start: CLOCK_IN, end: CLOCK_IN } },
        { location: createReference(clockOut), period: { start: CLOCK_OUT, end: CLOCK_OUT } },
      ],
    });
    for (const [code, status] of [
      ['bathing', 'completed'],
      ['laundry', 'cancelled'],
    ] as const) {
      await medplum.createResource({
        resourceType: 'Task',
        status,
        intent: 'order',
        code: { coding: [{ system: EXAMPLE_CONFIG.taskCodeSystem, code }] },
        encounter: createReference(encounter),
      });
    }
    return encounter;
  }

  test('Sends the employee, client, and visit in order and records the acceptance', async () => {
    const sent = fakeSandata();
    const encounter = await finishedVisit();

    const task = await handler(medplum, { bot, input: encounter, contentType, secrets });

    const urls = vi.mocked(fetch).mock.calls.map(([url, init]) => `${init?.method} ${url as string}`);
    expect(urls).toEqual([
      'POST https://uat-api.sandata.com/interfaces/intake/employees/rest/api/v1.1',
      'GET https://uat-api.sandata.com/interfaces/intake/employees/rest/api/v1.1/status?uuid=employees-uuid',
      'POST https://uat-api.sandata.com/interfaces/intake/clients/rest/api/v1.1',
      'GET https://uat-api.sandata.com/interfaces/intake/clients/rest/api/v1.1/status?uuid=clients-uuid',
      'POST https://uat-api.sandata.com/interfaces/intake/visits/rest/api/v1.1',
      'GET https://uat-api.sandata.com/interfaces/intake/visits/rest/api/v1.1/status?uuid=visits-uuid',
    ]);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('user:secret').toString('base64')}`,
      Account: '12345',
    });

    expect(sent.employees[0]).toMatchObject({
      ProviderIdentification: { ProviderQualifier: 'MedicaidID', ProviderID: '123456789' },
      EmployeeQualifier: 'EmployeeSSN',
      EmployeeIdentifier: '000056789',
      EmployeeFirstName: 'Alice',
    });
    expect(sent.clients[0]).toMatchObject({
      ClientIdentifier: '0012345678',
      ClientMiddleInitial: 'L',
      ClientTimeZone: 'US/Eastern',
      ClientAddress: [{ ClientAddressLine1: '12 Main St', ClientZip: '029030000', ClientAddressIsPrimary: true }],
    });

    const visit = sent.visits[0];
    expect(visit).toMatchObject({
      VisitOtherID: encounter.id.replaceAll('-', ''),
      ClientID: '0012345678',
      EmployeeIdentifier: '000056789',
      PayerID: 'STATE_MEDICAID',
      ProcedureCode: 'T1019',
      AdjInDateTime: null,
      AdjOutDateTime: null,
      BillVisit: true,
      Tasks: [{ TaskID: '100', TaskRefused: false }],
    });
    expect(visit.Calls.map((c) => [c.CallAssignment, c.CallType, c.CallDateTime, c.CallLatitude])).toEqual([
      ['Time In', 'Mobile', '2026-11-23T15:02:13Z', 41.8236],
      ['Time Out', 'Mobile', '2026-11-23T16:58:40Z', 41.8236],
    ]);
    expect(visit.Calls[0].CallExternalID).toMatch(/^[a-f0-9]{16}$/);
    expect(visit.VisitChanges).toBeUndefined();
    expect(String(visit.SequenceID)).toMatch(/^\d{14}$/);

    expect(task).toMatchObject({ status: 'completed', businessStatus: { text: 'accepted' } });
    expect(task?.focus?.reference).toBe(`Encounter/${encounter.id}`);
  });

  test('Sends a supervisor correction as adjusted times with VisitChanges', async () => {
    fakeSandata();
    const encounter = await finishedVisit();
    const first = await handler(medplum, { bot, input: encounter, contentType, secrets });
    const firstSequenceId = Number(first?.output?.find((o) => o.type.text === 'visit-sequence-id')?.valueString);

    // The caregiver stayed late but clocked out early; a supervisor corrects the end time
    const corrected = await medplum.updateResource<Encounter>({
      ...encounter,
      period: { start: CLOCK_IN, end: '2026-11-23T17:30:00.000Z' },
    });
    await medplum.createResource({
      resourceType: 'Provenance',
      target: [{ reference: `Encounter/${corrected.id}` }],
      recorded: '2026-11-24T14:05:00.000Z',
      agent: [{ who: { reference: 'Practitioner/supervisor', display: 'Dana O’Supervisor' } }],
      reason: [
        {
          coding: [{ system: EXAMPLE_CONFIG.reasonCodeSystem, code: '160' }],
          text: 'Caregiver clocked out before leaving',
        },
      ],
    });
    const sent = fakeSandata();

    const task = await handler(medplum, { bot, input: corrected, contentType, secrets });

    const visit = sent.visits[0];
    expect(visit.SequenceID).toBeGreaterThan(firstSequenceId);
    expect(visit.AdjInDateTime).toBeNull();
    expect(visit.AdjOutDateTime).toBe('2026-11-23T17:30:00Z');
    expect(visit.Calls[1].CallDateTime).toBe('2026-11-23T16:58:40Z');
    expect(visit.VisitChanges).toEqual([
      {
        SequenceID: visit.SequenceID,
        ChangeMadeBy: 'Dana OSupervisor',
        ChangeDateTime: '2026-11-24T14:05:00Z',
        ReasonCode: '160',
        ChangeReasonMemo: 'Caregiver clocked out before leaving',
      },
    ]);
    expect(task?.status).toBe('completed');
  });

  test('Refuses a manual visit that has no Provenance explaining it', async () => {
    fakeSandata();
    const encounter = await finishedVisit({ gps: false });

    const task = await handler(medplum, { bot, input: encounter, contentType, secrets });

    expect(fetch).not.toHaveBeenCalled();
    expect(task).toMatchObject({ status: 'failed', businessStatus: { text: 'invalid' } });
    expect(task?.statusReason?.text).toContain('no Provenance with a reason code');
  });

  test('Records a visit that Sandata rejects', async () => {
    fakeSandata({ visits: 'Unknown Client' });
    const encounter = await finishedVisit();

    const task = await handler(medplum, { bot, input: encounter, contentType, secrets });

    expect(task).toMatchObject({
      status: 'failed',
      businessStatus: { text: 'visits-rejected' },
      statusReason: { text: '-100: Unknown Client' },
    });
  });

  test('Does not resend a version of the Encounter that was already sent', async () => {
    fakeSandata();
    const encounter = await finishedVisit();
    await handler(medplum, { bot, input: encounter, contentType, secrets });
    vi.mocked(fetch).mockClear();

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    expect(fetch).not.toHaveBeenCalled();
  });

  test('Ignores visits that are still in progress', async () => {
    fakeSandata();
    const encounter = await finishedVisit();
    expect(await handler(medplum, { bot, input: { ...encounter, status: 'in-progress' }, contentType, secrets })).toBe(
      undefined
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
