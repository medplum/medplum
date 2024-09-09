import {
  BotEvent,
  createReference,
  getReferenceString,
  Hl7Message,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  MedplumClient,
  UCUM,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  Bundle,
  QuestionnaireResponse,
  Reference,
  SearchParameter,
  ServiceRequest,
  Specimen,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dotenv from 'dotenv';
import { ReadStream } from 'ssh2';
import { default as SftpClient } from 'ssh2-sftp-client';
import { Readable } from 'stream';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { handler, processOruMessage } from './read-oru-message';

dotenv.config();

const CONNECTION_DETAILS = {
  SFTP_USER: { name: 'SFTP_USER', valueString: 'user' },
  SFTP_HOST: { name: 'SFTP_HOST', valueString: '111111.server.transfer.us-east-1.amazonaws.com' },
  SFTP_PRIVATE_KEY: { name: 'SFTP_PRIVATE_KEY', valueString: 'abcd' },
  SFTP_ENVIRONMENT: { name: 'SFTP_ENVIRONMENT', valueString: 'test' },
};

vi.mock('ssh2-sftp-client');

describe('Read from Partner Lab', () => {
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
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          given: ['Bob'],
          family: 'Smith',
        },
      ],
      birthDate: '1968-12-08',
      address: [
        {
          line: ['1601 S Brazier St'],
          city: 'Coonrod',
          state: 'TX',
          postalCode: '77301',
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: '(111) 222-3456',
        },
      ],
      gender: 'male',
    });

    const requestingPhysician = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [
        {
          prefix: ['Dr.'],
          given: ['Bill'],
          family: 'Ogden',
        },
      ],
      gender: 'male',
    });

    const specimen = await medplum.createResource({ resourceType: 'Specimen' });

    const order = await medplum.createResource({
      resourceType: 'ServiceRequest',
      subject: createReference(patient),
      requester: createReference(requestingPhysician),
      status: 'active',
      intent: 'order',
      authoredOn: '2023-01-30T18:31:34.929Z',
      specimen: [createReference(specimen)],
      identifier: [
        {
          system: 'http://example.com/orderId',
          value: '456450',
        },
      ],
    });

    const performer = await medplum.createResource({
      resourceType: 'Organization',
      name: 'Acme Clinical Labs',
    });

    Object.assign(ctx, { medplum, patient, requestingPhysician, order, performer });
  });

  // Mock the sftp connection
  beforeEach(() => {
    mockSftp = new SftpClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  test.skip('Test Connection', async (ctx: any) => {
    await handler(ctx.medplum, {
      bot: { reference: 'Bot/123' },
      input: { resourceType: 'QuestionnaireResponse', status: 'completed' },
      contentType: 'string',
      secrets: { ...CONNECTION_DETAILS },
    } as BotEvent<QuestionnaireResponse>);
  }, 10000);

  test('Parse Input', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const createBinarySpy = vi.spyOn(medplum, 'createBinary');
    const serviceRequest = ctx.order as ServiceRequest;

    const msg = Hl7Message.parse(TEST_MESSAGE);
    await processOruMessage(medplum, msg, ctx.performer);

    const checkReports = await medplum.searchResources(
      'DiagnosticReport',
      `based-on=${getReferenceString(serviceRequest)}`
    );
    expect(checkReports).toHaveLength(1);
    expect(checkReports?.[0]?.result).toHaveLength(8);
    expect(checkReports?.[0]?.presentedForm).toHaveLength(1);

    const checkObservationPromise = checkReports?.[0]?.result?.map((r) => r && medplum.readReference(r));
    const checkObservations = checkObservationPromise && (await Promise.all(checkObservationPromise));
    expect(checkObservations).toBeDefined();
    expect(checkObservations).toHaveLength(8);
    expect(checkObservations?.map((o) => o.code?.coding?.at(0)?.code)).toMatchObject([
      'BUN',
      'CHOL',
      'CREAT',
      'HDL',
      'TRIG',
      'TSH',
      'LDL-CALCULATED',
      'HBA1C',
    ]);

    expect(checkObservations?.[0]).toMatchObject({
      resourceType: 'Observation',
      basedOn: [createReference(serviceRequest)],
      subject: createReference(ctx.patient),
      code: {
        text: 'BUN',
        coding: [
          {
            code: 'BUN',
          },
        ],
      },
      issued: '2023-02-09T14:52:00.000Z',
      performer: [
        {
          display: 'Acme Clinical Labs',
        },
      ],
      valueQuantity: {
        unit: 'MG/DL',
        value: 14,
        system: UCUM,
      },
      referenceRange: [
        {
          low: {
            value: 5,
            unit: 'MG/DL',
            system: UCUM,
          },
          high: {
            value: 20,
            unit: 'MG/DL',
            system: UCUM,
          },
        },
      ],
      interpretation: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
              code: 'N',
              display: 'Normal',
            },
          ],
        },
      ],
      status: 'final',
    });

    // Make sure TSH is flagged as low
    expect(checkObservations?.[5]?.interpretation?.[0]).toMatchObject({
      text: 'Low',
      coding: [
        { display: 'Low', code: 'L', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
      ],
    });

    /* Test Comparators */
    expect(checkObservations?.[5]?.valueQuantity).toMatchObject({
      value: 1,
      comparator: '<',
    });

    expect(checkObservations?.[7]?.valueQuantity).toMatchObject({
      value: 6.1,
      comparator: '>=',
    });

    expect(checkObservations?.[7]?.note).toHaveLength(2);
    expect(checkObservations?.[7]?.note).toMatchObject([
      {
        text: 'ACCORDING TO ADA GUIDELINE HEMOGLOBIN A1c CAN BE USED FOR THE PURPOSE OF SCREENING THE PRESENCE OF DIABETES.   <5.7% ----- CONSISTENT WITH THE ABSENCE OF DIABETES 5.7 - 6.4% ------ CONSISTENT WITH INCREASE RISK OF DIABETES (PREDIABETES) > OR =  6.5% CONSISTENT WITH DIABETES HEMOGLOBIN A1c CRITERIA FOR DIAGNOSIS OF DIABETES HAVE NOT BEEN ESTABLISHED FOR CHILDREN.  *',
      },
      {
        text: 'HEMOLYTIC ANEMIAS ARE CHARACTERIZED BY ERYTHROCYTES OF SHORTENED LIFESPAN. PREMATURE ERYTHROCYTE DESTRUCTION CAN RESULT IN NORMAL OR LOW VALUES OF GLYCOLATED HEMOGLOBIN, EVEN THOUGH THE TIME AVERAGE BLOOD GLUCOSE LEVEL MAY BE ELEVATED.',
      },
    ]);

    // Check that Specimen collection dates have been set
    const checkSpecimen1 = await medplum.readReference(serviceRequest.specimen?.[0] as Reference<Specimen>);
    expect(checkSpecimen1.receivedTime).toBe('2023-02-09T16:43:00.000Z');

    // Check that a PDF has been uploaded
    expect(createBinarySpy).toHaveBeenCalled();
  });

  test('Parse Input [Cancelled]', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const serviceRequest = ctx.order as ServiceRequest;
    const msg = Hl7Message.parse(CANCELLED_MESSAGE);

    await processOruMessage(medplum, msg, ctx.performer);

    const checkReports = await medplum.searchResources(
      'DiagnosticReport',
      `based-on=${getReferenceString(serviceRequest)}`
    );
    expect(checkReports).toHaveLength(1);
    expect(checkReports?.[0]?.result).toHaveLength(8);
    expect(checkReports?.[0]?.status).toBe('cancelled');
    expect(checkReports?.[0]?.presentedForm).toHaveLength(1);

    const checkObservationPromise = checkReports?.[0]?.result?.map((r) => r && medplum.readReference(r));
    const checkObservations = checkObservationPromise && (await Promise.all(checkObservationPromise));

    expect(checkObservations).toHaveLength(8);
    expect(checkObservations?.map((o) => o.code?.coding?.at(0)?.code)).toMatchObject([
      'BUN',
      'CHOL',
      'CREAT',
      'HDL',
      'TRIG',
      'TSH',
      'LDL',
      'HBA1C',
    ]);

    expect(checkObservations?.map((o) => o.status)).toMatchObject(Array(8).fill('cancelled'));
    expect(checkObservations?.map((o) => o.dataAbsentReason)).toMatchObject(
      Array(8).fill({
        text: 'Expired',
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
            code: 'EX',
            display: 'Expired',
          },
        ],
      })
    );

    const checkOrder = await medplum.readResource('ServiceRequest', serviceRequest.id as string);
    const checkComments = checkOrder.note;
    expect(checkComments).toHaveLength(1);
    expect(checkComments?.[0]?.text).toBe('Order Cancelled by Partner Lab: SAMPLE STABILITY EXPIRED');

    const checkSpecimen1 = await medplum.readReference(serviceRequest.specimen?.[0] as Reference<Specimen>);

    expect(checkSpecimen1.status).toBe('unsatisfactory');
    expect(checkSpecimen1.condition).toMatchObject([
      {
        text: 'Expired',
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
            code: 'EX',
            display: 'Expired',
          },
        ],
      },
    ]);
  });

  test('Parse Input [Unable to Calculate]', async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const serviceRequest = ctx.order as ServiceRequest;
    const msg = Hl7Message.parse(NOT_CALCULATED_MESSAGE);

    await processOruMessage(medplum, msg, ctx.performer);

    const checkReports = await medplum.searchResources(
      'DiagnosticReport',
      `based-on=${getReferenceString(serviceRequest)}`
    );
    expect(checkReports).toHaveLength(1);

    const checkObservationPromise = checkReports?.[0]?.result?.map((r) => r && medplum.readReference(r));
    const checkObservations = checkObservationPromise && (await Promise.all(checkObservationPromise));
    expect(checkObservations).toHaveLength(6);
    expect(checkObservations?.map((o) => o.code?.coding?.at(0)?.code)).toMatchObject([
      'BUN',
      'CHOL',
      'CREAT',
      'HDL',
      'TRIG',
      'LDL-CALCULATED',
    ]);

    expect(checkObservations?.[5].valueQuantity?.value).not.toBeDefined();
    expect(checkObservations?.[5].valueQuantity?.unit).not.toBeDefined();
    expect(checkObservations?.[5].referenceRange).toBeDefined();
    expect(checkObservations?.[5].dataAbsentReason?.text).toBeDefined();
  });

  // Test that the bot gracefully handles errors when reading files from SFTP
  test.skip('Handle file reading errors', async (ctx: any) => {
    const medplum: MedplumClient = ctx.medplum;
    vi.mocked(mockSftp)
      // The first time we read from the SFTP server, we'll return a valid message
      .createReadStream.mockImplementationOnce(() => {
        const readable = new Readable();
        readable.push(TEST_MESSAGE);
        readable.push(null);

        return readable as ReadStream;
      })
      // The second time we read from the SFTP server, we'll throw an error, simulating running out of file handles
      .mockImplementationOnce(() => {
        throw new Error('Too many files open');
      });

    // Simulate two files on the server
    vi.mocked(mockSftp).list.mockImplementation(async (path: string) => {
      if (path.includes('out')) {
        return [
          { name: '111111.oru', type: '-' },
          { name: '222222.oru', type: '-' },
        ] as SftpClient.FileInfo[];
      }

      return [];
    });

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: { resourceType: 'QuestionnaireResponse', status: 'completed' },
      contentType: 'string',
      secrets: { ...CONNECTION_DETAILS },
    } as BotEvent<QuestionnaireResponse>);
  });
});

const TEST_MESSAGE = `MSH|^~\\&|Acme_Lims|ACME_LAB||52054|20230209145442||ORU^R01|SSH^41440165|P|2.3|
PID|1|456450|456450|||Smith^Bob||19740108|F|||123 Main Street #403^^Springfield^MA^12345||||||||
NTE|1||COLLECTED 2/4/2023, 7:23:20 AM  FRIDGED 2/6/2023 4:30 PM PST
PV1|||0||||0^^^|||||||||||||||||||||||||||||||||||||||||||||
IN1|1|CLI|CLI|CLIENT BILL|^^^^||||||||||||I|||||||||||||||||||||||||||
ORC|RE|17286447|12424639|17286447|CM||||202302091143|11769^De Leon^Shannia||0^^^|52054^example.com
OBR|1|||8167^PANEL B FULL^^PANEL B FULL||202302091143|20230204|||||||202302091143|200^Serum|0^^^||12424639|52054||||||F|||||||||
OBX|1|NM|207^BUN^^BUN||14|MG/DL|5 - 20||||F|||20230209145200|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|2|NM|211^CHOLESTEROL^^CHOL||200|MG/DL|0 - 200|H|||F|||20230209130100|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|3|NM|213^CREATININE^^CREA||0.9|MG/DL|0.5 - 1.3||||F|||20230209130100|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|4|NM|220^HDL^^HDLC3||39|MG/DL|35 - 80||||F|||20230209130200|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|5|NM|232^TRIGLYCERIDES^^TRIG||99|MG/DL|50 - 200||||F|||20230209130100|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|7|ST|819^TSH^^TSH||<1|MCIU/ML|0.500 - 5.000|L|||F|||20230220141700|1^Acme Clinical Labs|2021^Maldonado^Melanie|
OBX|7|NM|267^LDL (CALCULATED)^^LDL||66|MG/DL|0 - 100||||F|||20230216132900|1^Acme Clinical Labs|9995^Auto Approver^|
NTE|1||DESIRABLE RANGE LESS THAN 100 MG/DL WITH CHD OR DIABETES AND LESS THAN 70 MG/DL FOR DIABETIC PATIENTS WITH KNOWN HEART DISEASE.
OBR|2|||809^HEMOGLOBIN A1C^^HGBA1C||202302091143|20230204|||||||202302091144|201^Whole Blood|0^^^||12424639|52054||||||F|||||||||9995^Auto Approver^
OBX|1|ST|809^HEMOGLOBIN A1C^^HGBA1C||>=6.1|%|4.0 - 5.6|H|||F|||20230209130500|1^Acme Clinical Labs|9995^Auto Approver^|
NTE|1||ACCORDING TO ADA GUIDELINE HEMOGLOBIN A1c CAN BE USED FOR THE PURPOSE OF SCREENING THE PRESENCE OF DIABETES.   <5.7% ----- CONSISTENT WITH THE ABSENCE OF DIABETES 5.7 - 6.4% ------ CONSISTENT WITH INCREASE RISK OF DIABETES (PREDIABETES) > OR =  6.5% CONSISTENT WITH DIABETES HEMOGLOBIN A1c CRITERIA FOR DIAGNOSIS OF DIABETES HAVE NOT BEEN ESTABLISHED FOR CHILDREN.  *
NTE|2||HEMOLYTIC ANEMIAS ARE CHARACTERIZED BY ERYTHROCYTES OF SHORTENED LIFESPAN. PREMATURE ERYTHROCYTE DESTRUCTION CAN RESULT IN NORMAL OR LOW VALUES OF GLYCOLATED HEMOGLOBIN, EVEN THOUGH THE TIME AVERAGE BLOOD GLUCOSE LEVEL MAY BE ELEVATED.
OBX|2|ED|PDF^PDFBASE64|1|^^PDF^Base64^JVBERi0xLjQNCiW0tba3DQ`;

const CANCELLED_MESSAGE = `MSH|^~\\&|Acme_Lims|ACME_LAB||52054|20230217165917||ORU^R01|SSH^41659279|P|2.3|
PID|1|456450|456450|||Smith^Bob||19740108|F|||123 Main Street #403^^Springfield^MA^12345||||||||
NTE|1||Sample Stability Expired
PV1|||0||||0^^^|||||||||||||||||||||||||||||||||||||||||||||
IN1|1|CLI|CLI|CLIENT BILL|^^^^||||||||||||I|||||||||||||||||||||||||||
ORC|RE|17384033|12739434|17384033|CM||||202304111258|775^Simpson^Lisa||0^^^|52054^ACME HEALTH VENTURES
OBR|1|||8167^PANEL B FULL^^PANEL B FULL||202304111258|202304040815|||||||202304111301|200^Serum|0^^^||12739434|52054||||||X|||||||||775^Simpson^Lisa
NTE|1||Sample Stability Expired
OBX|1|ST|207^BUN^^BUN||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
OBX|2|ST|211^CHOLESTEROL^^CHOL||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
OBX|3|ST|213^CREATININE^^CREA||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
OBX|4|ST|220^HDL^^HDLC3||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
OBX|5|ST|232^TRIGLYCERIDES^^TRIG||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
OBX|6|ST|819^TSH^^TSH||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
OBX|7|ST|1018^LDL (DIRECT)^^DLDL||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
NTE|1||DESIRABLE RANGE LESS THAN 100 MG/DL WITH CHD OR DIABETES AND LESS THAN 70 MG/DL FOR DIABETIC PATIENTS WITH KNOWN HEART DISEASE.
OBX|8|ST|809^HEMOGLOBIN A1C^^HGBA1C||Canceled||||||X|||20230411130100|1^Acme Clinical Labs|775^Simpson^Lisa|
NTE|1||ACCORDING TO ADA GUIDELINE HEMOGLOBIN A1c CAN BE USED FOR THE PURPOSE OF SCREENING THE PRESENCE OF DIABETES.   <5.7% ----- CONSISTENT WITH THE ABSENCE OF DIABETES 5.7 - 6.4% ------ CONSISTENT WITH INCREASE RISK OF DIABETES (PREDIABETES) > OR =  6.5% CONSISTENT WITH DIABETES HEMOGLOBIN A1c CRITERIA FOR DIAGNOSIS OF DIABETES HAVE NOT BEEN ESTABLISHED FOR CHILDREN.  *
NTE|2||HEMOLYTIC ANEMIAS ARE CHARACTERIZED BY ERYTHROCYTES OF SHORTENED LIFESPAN. PREMATURE ERYTHROCYTE DESTRUCTION CAN RESULT IN NORMAL OR LOW VALUES OF GLYCOLATED HEMOGLOBIN, EVEN THOUGH THE TIME AVERAGE BLOOD GLUCOSE LEVEL MAY BE ELEVATED.
OBX|9|ED|PDF^PDFBASE64|1|^^PDF^Base64^JVBERi0xLjQNCiW`;

const NOT_CALCULATED_MESSAGE = `MSH|^~\\&|Acme_Lims|ACME_LAB||52054|20230317084423||ORU^R01|SSH^42583295|P|2.3|
PID|1|456450|456450|||Smith^Bob||19740108|F|||123 Main Street #403^^Springfield^MA^12345||||||||
PV1|||0||||0^^^|||||||||||||||||||||||||||||||||||||||||||||
ORC|RE|456450|12510666|17316155|CM||||202302281704|10129^30^AutoComm||0^^^|52054^ACME HEALTH VENTURES
OBR|1|456450||8167^PANEL B FULL^^PANEL B FULL||202302281704|202302281704|||||||202302281704|200^Serum|0^^^||12510666|52054||||||C|||||||||
OBX|1|NM|207^BUN^^BUN||13|MG/DL|5 - 20||||F|||20230228191900|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|2|NM|211^CHOLESTEROL^^CHOL||211|MG/DL|0 - 200|H|||F|||20230228191900|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|3|NM|213^CREATININE^^CREA||0.9|MG/DL|0.5 - 1.3||||F|||20230228191900|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|4|NM|220^HDL^^HDLC3||22|MG/DL|29 - 72|L|||F|||20230228191900|1^Acme Clinical Labs|9995^Auto Approver^|
OBX|5|NM|232^TRIGLYCERIDES^^TRIG||1486|MG/DL|50 - 200|H|||F|||20230228193700|1^Acme Clinical Labs|8940^Simpson^Lisa|
OBX|6|ST|267^LDL (CALCULATED)^^LDL||UNABLE TO CALCULATE|MG/DL|0 - 100||||C|||20230317084300|1^Acme Clinical Labs|733^Colfer^Stephanie|
NTE|1||Amended Result. The previous result -108 was distributed at 03/01/23 05:14 AM.
`;
