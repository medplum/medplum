// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getReferenceString,
  Hl7Message,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type {
  Bundle,
  Patient,
  Encounter,
  AllergyIntolerance,
  MessageHeader,
  SearchParameter,
  Practitioner,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dotenv from 'dotenv';
import type { ReadStream } from 'ssh2';
import { default as SftpClient } from 'ssh2-sftp-client';
import { Readable } from 'stream';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { handler, processAdtMessage } from './adt-sftp-listener';

dotenv.config({ quiet: true });

const CONNECTION_DETAILS = {
  SFTP_USER: { name: 'SFTP_USER', valueString: 'user' },
  SFTP_HOST: { name: 'SFTP_HOST', valueString: '111111.server.transfer.us-east-1.amazonaws.com' },
  SFTP_PRIVATE_KEY: { name: 'SFTP_PRIVATE_KEY', valueString: 'abcd' },
};

vi.mock('ssh2-sftp-client');

describe('ADT SFTP Listener', () => {
  let mockSftp: SftpClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async (ctx: any) => {
    const medplum = new MockClient();

    Object.assign(ctx, { medplum });
  });

  // Mock the sftp connection
  beforeEach(() => {
    mockSftp = new SftpClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  test('Process ADT A01 Message with Allergies', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(ADT_A01_MESSAGE_1);

    await processAdtMessage(medplum, msg);

    // Check that Patient was created
    const patients = await medplum.searchResources('Patient', 'identifier=4093140347');
    expect(patients).toHaveLength(1);

    const patient = patients?.[0] as Patient;
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org',
          value: '4093140347',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MR',
                display: 'Medical record number',
              },
            ],
          },
        },
      ],
      name: [
        {
          family: 'Young',
          given: ['AKI Scenario 8', 'Gladys'],
          prefix: ['Miss'],
          use: 'official',
        },
      ],
      birthDate: '1971-03-20',
      gender: 'female',
      address: [
        {
          line: ['18 Forebear House', 'Latency Place'],
          city: 'Westerham',
          postalCode: 'US98 6HD',
          country: 'GBR',
          use: 'home',
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: '079 5571 8211',
          use: 'home',
        },
      ],
    });

    // Check that Practitioner was created
    const practitioners = await medplum.searchResources('Practitioner', 'identifier=C007');
    expect(practitioners).toHaveLength(1);

    const practitioner = practitioners?.[0] as Practitioner;
    expect(practitioner).toMatchObject({
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org/practitioner',
          value: 'C007',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MD',
                display: 'Medical License number',
              },
            ],
          },
        },
      ],
      name: [
        {
          family: 'Litherland',
          given: ['Natasha'],
          prefix: ['Dr'],
          use: 'official',
        },
      ],
    });

    // Check that Encounter was created
    const encounters = await medplum.searchResources('Encounter', `subject=${getReferenceString(patient)}`);
    expect(encounters).toHaveLength(1);

    const encounter = encounters?.[0] as Encounter;
    expect(encounter).toMatchObject({
      resourceType: 'Encounter',
      status: 'arrived',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'inpatient encounter',
      },
      subject: {
        reference: getReferenceString(patient),
        display: 'Miss AKI Scenario 8 Gladys Young',
      },
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org/visit',
          value: '18211742617487601674',
        },
      ],
      location: [
        {
          location: {
            display: 'RenalWard MainRoom Bed 11',
          },
        },
      ],
      period: {
        start: '2020-05-08T13:07:36Z',
      },
      participant: [
        {
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr Natasha Litherland',
          },
        },
      ],
    });

    // Check that AllergyIntolerance resources were created
    const allergies = await medplum.searchResources('AllergyIntolerance', `patient=${getReferenceString(patient)}`);
    expect(allergies).toHaveLength(3);

    const allergy1 = allergies?.find((a) => a.code?.coding?.[0]?.code === '414285001') as AllergyIntolerance;
    expect(allergy1).toMatchObject({
      resourceType: 'AllergyIntolerance',
      patient: {
        reference: getReferenceString(patient),
      },
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'active',
            display: 'Active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
            display: 'Confirmed',
          },
        ],
      },
      category: ['food'],
      type: 'allergy',
      code: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '414285001',
            display: 'Food allergy (disorder)',
          },
        ],
      },
      criticality: 'high',
      reaction: [
        {
          manifestation: [
            {
              text: 'Swollen face',
            },
          ],
        },
      ],
      onsetDateTime: '2019-08-18',
    });

    const allergy2 = allergies?.find((a) => a.code?.coding?.[0]?.code === '418471000') as AllergyIntolerance;
    expect(allergy2).toMatchObject({
      category: ['food'],
      type: 'allergy',
      criticality: 'low',
      reaction: [
        {
          manifestation: [
            {
              text: 'Feeling sick',
            },
          ],
        },
      ],
      onsetDateTime: '2019-11-29',
    });

    const allergy3 = allergies?.find((a) => a.code?.coding?.[0]?.code === '419199007') as AllergyIntolerance;
    expect(allergy3).toMatchObject({
      type: 'allergy',
      criticality: 'low',
      reaction: [
        {
          manifestation: [
            {
              text: 'Vomiting',
            },
          ],
        },
      ],
      onsetDateTime: '2019-12-30',
    });

    // Check that MessageHeader was created
    const messageHeaders = await medplum.searchResources('MessageHeader');
    expect(messageHeaders).toHaveLength(1);

    const messageHeader = messageHeaders?.[0] as MessageHeader;
    expect(messageHeader).toMatchObject({
      resourceType: 'MessageHeader',
      eventCoding: {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0003',
        code: 'A01',
        display: 'Admit/visit notification',
      },
      source: {
        name: 'SIMHOSP',
        endpoint: 'SFAC',
      },
    });
  });

  test('Process ADT A01 Message without Allergies', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(ADT_A01_MESSAGE_2);

    await processAdtMessage(medplum, msg);

    // Check that Patient was created
    const patients = await medplum.searchResources('Patient', 'identifier=3220604768');
    expect(patients).toHaveLength(1);

    const patient = patients?.[0] as Patient;
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      name: [
        {
          family: 'Woolridge',
          given: ['Gabrielle', 'Joanne'],
          prefix: ['Miss'],
          use: 'official',
        },
      ],
      birthDate: '2002-07-18',
      gender: 'female',
    });

    // Check that Practitioner was created
    const practitioners = await medplum.searchResources('Practitioner', 'identifier=C004');
    expect(practitioners).toHaveLength(1);

    const practitioner = practitioners?.[0] as Practitioner;
    expect(practitioner).toMatchObject({
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org/practitioner',
          value: 'C004',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MD',
                display: 'Medical License number',
              },
            ],
          },
        },
      ],
      name: [
        {
          family: 'Walsh',
          given: ['Joyce'],
          prefix: ['Dr'],
          use: 'official',
        },
      ],
    });

    // Check that Encounter was created
    const encounters = await medplum.searchResources('Encounter', `subject=${getReferenceString(patient)}`);
    expect(encounters).toHaveLength(1);

    const encounter = encounters?.[0] as Encounter;
    expect(encounter).toMatchObject({
      resourceType: 'Encounter',
      status: 'arrived',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'inpatient encounter',
      },
      subject: {
        reference: getReferenceString(patient),
        display: 'Miss Gabrielle Joanne Woolridge',
      },
      participant: [
        {
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr Joyce Walsh',
          },
        },
      ],
    });

    // Check that no AllergyIntolerance resources were created
    const allergies = await medplum.searchResources('AllergyIntolerance', `patient=${getReferenceString(patient)}`);
    expect(allergies).toHaveLength(0);
  });

  test('Process ADT A01 Message with Male Patient', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(ADT_A01_MESSAGE_3);

    await processAdtMessage(medplum, msg);

    // Check that Patient was created with correct gender
    const patients = await medplum.searchResources('Patient', 'identifier=2451929988');
    expect(patients).toHaveLength(1);

    const patient = patients?.[0] as Patient;
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      name: [
        {
          family: 'Fleet',
          given: ['Ivan', 'Cameron'],
          prefix: ['Mr'],
          use: 'official',
        },
      ],
      birthDate: '1932-04-23',
      gender: 'male',
    });

    // Check that Practitioner was created
    const practitioners = await medplum.searchResources('Practitioner', 'identifier=C006');
    expect(practitioners).toHaveLength(1);

    const practitioner = practitioners?.[0] as Practitioner;
    expect(practitioner).toMatchObject({
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org/practitioner',
          value: 'C006',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MD',
                display: 'Medical License number',
              },
            ],
          },
        },
      ],
      name: [
        {
          family: 'Woolfson',
          given: ['Kathleen'],
          prefix: ['Dr'],
          use: 'official',
        },
      ],
    });
  });

  test('Process ADT A08 Message (Update Patient Information)', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(ADT_A08_MESSAGE);

    await processAdtMessage(medplum, msg);

    // Check that Patient was created
    const patients = await medplum.searchResources('Patient', 'identifier=3740313415');
    expect(patients).toHaveLength(1);

    const patient = patients?.[0] as Patient;
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      name: [
        {
          family: 'Barnes',
          given: ['Lisa'],
          prefix: ['Mrs'],
          suffix: ['B.Sc'],
          use: 'official',
        },
      ],
      birthDate: '1984-11-21',
      gender: 'female',
    });

    // Check that Practitioner was created
    const practitioners = await medplum.searchResources('Practitioner', 'identifier=C003');
    expect(practitioners).toHaveLength(1);

    const practitioner = practitioners?.[0] as Practitioner;
    expect(practitioner).toMatchObject({
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org/practitioner',
          value: 'C003',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MD',
                display: 'Medical License number',
              },
            ],
          },
        },
      ],
      name: [
        {
          family: 'Cuddy',
          given: ['Kevin'],
          prefix: ['Dr'],
          use: 'official',
        },
      ],
    });

    // Check that Encounter was created with outpatient class
    const encounters = await medplum.searchResources('Encounter', `subject=${getReferenceString(patient)}`);
    expect(encounters).toHaveLength(1);

    const encounter = encounters?.[0] as Encounter;
    expect(encounter).toMatchObject({
      resourceType: 'Encounter',
      status: 'arrived',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'inpatient encounter',
      },
      subject: {
        reference: getReferenceString(patient),
        display: 'Mrs Lisa Barnes B.Sc',
      },
      participant: [
        {
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr Kevin Cuddy',
          },
        },
      ],
    });

    // Check that MessageHeader was created with A08 event
    const messageHeaders = await medplum.searchResources('MessageHeader');
    expect(messageHeaders).toHaveLength(1);

    const messageHeader = messageHeaders?.[0] as MessageHeader;
    expect(messageHeader).toMatchObject({
      resourceType: 'MessageHeader',
      eventCoding: {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0003',
        code: 'A08',
        display: 'Update patient information',
      },
    });
  });

  test('Process ADT A01 Message with Practitioner Name Variations', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(ADT_A01_MESSAGE_WITH_COMPLEX_PRACTITIONER_NAME);

    await processAdtMessage(medplum, msg);

    // Check that Patient was created
    const patients = await medplum.searchResources('Patient', 'identifier=1234567890');
    expect(patients).toHaveLength(1);

    const patient = patients?.[0] as Patient;
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      name: [
        {
          family: 'Test',
          given: ['Patient'],
          use: 'official',
        },
      ],
    });

    // Check that Practitioner was created with complex name structure
    const practitioners = await medplum.searchResources('Practitioner', 'identifier=DOC123');
    expect(practitioners).toHaveLength(1);

    const practitioner = practitioners?.[0] as Practitioner;
    expect(practitioner).toMatchObject({
      resourceType: 'Practitioner',
      identifier: [
        {
          system: 'http://hospital.smarthealthit.org/practitioner',
          value: 'DOC123',
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MD',
                display: 'Medical License number',
              },
            ],
          },
        },
      ],
      name: [
        {
          family: 'Smith',
          given: ['John', 'Michael'],
          prefix: ['Dr'],
          suffix: ['Jr'],
          use: 'official',
        },
      ],
    });

    // Check that Encounter was created with practitioner reference
    const encounters = await medplum.searchResources('Encounter', `subject=${getReferenceString(patient)}`);
    expect(encounters).toHaveLength(1);

    const encounter = encounters?.[0] as Encounter;
    expect(encounter).toMatchObject({
      resourceType: 'Encounter',
      status: 'arrived',
      subject: {
        reference: getReferenceString(patient),
        display: 'Patient Test',
      },
      participant: [
        {
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr John Michael Smith Jr',
          },
        },
      ],
    });
  });

  test('Handle Invalid Message Type', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(INVALID_MESSAGE_TYPE);

    // Get counts before processing the invalid message
    const patientsBefore = await medplum.searchResources('Patient');
    const encountersBefore = await medplum.searchResources('Encounter');
    const allergiesBefore = await medplum.searchResources('AllergyIntolerance');
    const messageHeadersBefore = await medplum.searchResources('MessageHeader');

    // Should throw an error and not create any resources
    try {
      await processAdtMessage(medplum, msg);
    } catch (err: any) {
      expect(err.message).toContain('Invalid message type: ORU');
    }

    // Check that no NEW resources were created
    const patientsAfter = await medplum.searchResources('Patient');
    const encountersAfter = await medplum.searchResources('Encounter');
    const allergiesAfter = await medplum.searchResources('AllergyIntolerance');
    const messageHeadersAfter = await medplum.searchResources('MessageHeader');

    expect(patientsAfter).toHaveLength(patientsBefore.length);
    expect(encountersAfter).toHaveLength(encountersBefore.length);
    expect(allergiesAfter).toHaveLength(allergiesBefore.length);
    expect(messageHeadersAfter).toHaveLength(messageHeadersBefore.length);
  });

  test('Handle Invalid Message Subtype', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const msg = Hl7Message.parse(INVALID_MESSAGE_SUBTYPE);

    // Get counts before processing the invalid message
    const patientsBefore = await medplum.searchResources('Patient');
    const encountersBefore = await medplum.searchResources('Encounter');
    const allergiesBefore = await medplum.searchResources('AllergyIntolerance');
    const messageHeadersBefore = await medplum.searchResources('MessageHeader');

    // Should throw an error and not create any resources
    try {
      await processAdtMessage(medplum, msg);
    } catch (err: any) {
      expect(err.message).toContain('Invalid message subtype: A02');
    }

    // Check that no NEW resources were created
    const patientsAfter = await medplum.searchResources('Patient');
    const encountersAfter = await medplum.searchResources('Encounter');
    const allergiesAfter = await medplum.searchResources('AllergyIntolerance');
    const messageHeadersAfter = await medplum.searchResources('MessageHeader');

    expect(patientsAfter).toHaveLength(patientsBefore.length);
    expect(encountersAfter).toHaveLength(encountersBefore.length);
    expect(allergiesAfter).toHaveLength(allergiesBefore.length);
    expect(messageHeadersAfter).toHaveLength(messageHeadersBefore.length);
  });

  test.skip('Test SFTP Connection', async (ctx: any) => {
    await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: { resourceType: 'QuestionnaireResponse', status: 'completed' },
      contentType: 'string',
      secrets: { ...CONNECTION_DETAILS },
    } as BotEvent<any>);
  }, 10000);

  // Test that the bot gracefully handles errors when reading files from SFTP
  test.skip('Handle file reading errors', async (ctx: any) => {
    const medplum: MedplumClient = ctx.medplum;
    vi.mocked(mockSftp)
      // The first time we read from the SFTP server, we'll return a valid message
      .createReadStream.mockImplementationOnce(() => {
        const readable = new Readable();
        readable.push(ADT_A01_MESSAGE_1);
        readable.push(null);

        return readable as ReadStream;
      })
      // The second time we read from the SFTP server, we'll throw an error, simulating running out of file handles
      .mockImplementationOnce(() => {
        throw new Error('Too many files open');
      });

    // Simulate two files on the server
    vi.mocked(mockSftp).list.mockImplementation(async (path: string) => {
      if (path.includes('adt')) {
        return [
          { name: '111111.adt', type: '-' },
          { name: '222222.adt', type: '-' },
        ] as SftpClient.FileInfo[];
      }

      return [];
    });

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: { resourceType: 'QuestionnaireResponse', status: 'completed' },
      contentType: 'string',
      secrets: { ...CONNECTION_DETAILS },
    } as BotEvent<any>);
  });
});

const ADT_A01_MESSAGE_WITH_COMPLEX_PRACTITIONER_NAME = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508130736||ADT^A01|127|T|2.3|||AL||44|ASCII
EVN|A01|20200508130736|||DOC123^Smith^John^Michael^Jr^Dr^^^DRNBR^PRSNL^^^ORGDR|
PID|1|1234567890^^^SIMULATOR MRN^MRN|1234567890^^^SIMULATOR MRN^MRN||Test^Patient||19710320000000|F|||123 Main St^^City^^12345^USA|||||||||||||||||||||||||||
PD1|||FAMILY PRACTICE^^12345|
PV1|1|I|TestWard^MainRoom^Bed 1^Simulated Hospital^^BED^Main Building^1|28b|||DOC123^Smith^John^Michael^Jr^Dr^^^DRNBR^PRSNL^^^ORGDR|||SUR|||||||||1234567890^^^^visitid||||||||||||||||||||||ARRIVED|||20200508130736||`;

const ADT_A01_MESSAGE_1 = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508130736||ADT^A01|127|T|2.3|||AL||44|ASCII
EVN|A01|20200508130736|||C007^Litherland^Natasha^^^Dr^^^DRNBR^PRSNL^^^ORGDR|
PID|1|4093140347^^^SIMULATOR MRN^MRN|4093140347^^^SIMULATOR MRN^MRN~6621905637^^^NHSNBR^NHSNMBR||Young^AKI Scenario 8^Gladys^^Miss^Ed.D.^CURRENT||19710320000000|F|||18 Forebear House^Latency Place^Westerham^^US98 6HD^GBR^HOME||079 5571 8211^HOME|||||||||P^Black or Black British - Other^^^||||||||
PD1|||FAMILY PRACTICE^^12345|
PV1|1|I|RenalWard^MainRoom^Bed 11^Simulated Hospital^^BED^Main Building^5|28b|||C007^Litherland^Natasha^^^Dr^^^DRNBR^PRSNL^^^ORGDR|||SUR|||||||||18211742617487601674^^^^visitid||||||||||||||||||||||ARRIVED|||20200508130736||
AL1|0|MC|414285001^Food allergy (disorder)^SNM3^^|SV|Swollen face|20190818130736
AL1|1|FA|418471000^Propensity to adverse reactions to food (disorder)^SNM3^^|MO|Feeling sick|20191129130736
AL1|2|MA|419199007^Allergy to substance (disorder)^SNM3^^|MI|Vomiting|20191230130736`;

const ADT_A01_MESSAGE_2 = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508130742||ADT^A01|138|T|2.3|||AL||44|ASCII
EVN|A01|20200508130742|||C004^Walsh^Joyce^^^Dr^^^DRNBR^PRSNL^^^ORGDR|
PID|1|3220604768^^^SIMULATOR MRN^MRN|3220604768^^^SIMULATOR MRN^MRN~0869582828^^^NHSNBR^NHSNMBR||Woolridge^Gabrielle^Joanne^^Miss^^CURRENT||20020718000000|F|||159 Spasm Lane^^Westerham^^TR37 5LO^GBR^HOME||020 1023 8796^HOME|||||||||A^White - British^^^||||||||
PD1|||FAMILY PRACTICE^^12345|
PV1|1|I|OtherWard^MainRoom^Bed 49^Simulated Hospital^^BED^Main Building^4|28b|||C004^Walsh^Joyce^^^Dr^^^DRNBR^PRSNL^^^ORGDR|||PUL|||||||||2939217843441610509^^^^visitid||||||||||||||||||||||ARRIVED|||20200508130742||`;

const ADT_A01_MESSAGE_3 = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508130734||ADT^A01|119|T|2.3|||AL||44|ASCII
EVN|A01|20200508130734|||C006^Woolfson^Kathleen^^^Dr^^^DRNBR^PRSNL^^^ORGDR|
PID|1|2451929988^^^SIMULATOR MRN^MRN|2451929988^^^SIMULATOR MRN^MRN~3229465571^^^NHSNBR^NHSNMBR||Fleet^Ivan^Cameron^^Mr^^CURRENT||19320423000000|M|||190 Notify Avenue^^Westerham^^HV20 2QG^GBR^HOME||020 2883 8342^HOME|||||||||N^Black or Black British - African^^^||||||||
PD1|||FAMILY PRACTICE^^12345|
PV1|1|I|OtherWard^MainRoom^Bed 43^Simulated Hospital^^BED^Main Building^4|28b|||C006^Woolfson^Kathleen^^^Dr^^^DRNBR^PRSNL^^^ORGDR|||MED|||||||||13852201969791978666^^^^visitid||||||||||||||||||||||ARRIVED|||20200508130734||`;

const ADT_A08_MESSAGE = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508140744||ADT^A08|143|T|2.3|||AL||44|ASCII
EVN|A08|20200508140744|||C003^Cuddy^Kevin^^^Dr^^^DRNBR^PRSNL^^^ORGDR|
PID|1|3740313415^^^SIMULATOR MRN^MRN|3740313415^^^SIMULATOR MRN^MRN~5871435831^^^NHSNBR^NHSNMBR||Barnes^Lisa^^B.Sc^Mrs^^CURRENT||19841121000000|F|||42 Beetle Lane^^Wembley^^TO91 1FY^GBR^HOME||020 1070 0783^HOME|||||||||A^White - British^^^||||||||
PD1|||FAMILY PRACTICE^^12345|
PV1|1|O|OtherWard^MainRoom^Bed 51^Simulated Hospital^^BED^Main Building^4|28b|||C003^Cuddy^Kevin^^^Dr^^^DRNBR^PRSNL^^^ORGDR|||URO|||||||||16450960227094948484^^^^visitid||||||||||||||||||||||ARRIVED|||20200508140744||`;

const INVALID_MESSAGE_TYPE = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508130736||ORU^R01|127|T|2.3|||AL||44|ASCII
PID|1|4093140347^^^SIMULATOR MRN^MRN|4093140347^^^SIMULATOR MRN^MRN||Young^Test^Patient||19710320000000|F|||123 Main St^^City^^12345^USA|||||||||||||||||||||||||||`;

const INVALID_MESSAGE_SUBTYPE = `MSH|^~\\&|SIMHOSP|SFAC|RAPP|RFAC|20200508130736||ADT^A02|127|T|2.3|||AL||44|ASCII
PID|1|4093140347^^^SIMULATOR MRN^MRN|4093140347^^^SIMULATOR MRN^MRN||Young^Test^Patient||19710320000000|F|||123 Main St^^City^^12345^USA|||||||||||||||||||||||||||`;
