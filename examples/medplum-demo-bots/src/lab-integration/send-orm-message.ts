import {
  BotEvent,
  getIdentifier,
  getReferenceString,
  Hl7Context,
  Hl7Field,
  Hl7Message,
  Hl7Segment,
  MedplumClient,
} from '@medplum/core';
import { HumanName, Patient, QuestionnaireResponse, Reference, ServiceRequest, Specimen } from '@medplum/fhirtypes';

import Client from 'ssh2-sftp-client';

const FACILITY_CODE = '52054';

/**
 * This Bot demonstrates how to send a lab order to an SFTP server in the form of HL7v2 ORM messages
 *
 * See: https://hl7-definition.caristix.com/v2/HL7v2.3/TriggerEvents/ORM_O01
 *
 * @param medplum - The Medplum Client object
 * @param event - The BotEvent object
 * @returns The data returned by the `list` command
 */
export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<any> {
  const host = event.secrets['SFTP_HOST'].valueString;
  const user = event.secrets['SFTP_USER'].valueString;
  const key = event.secrets['SFTP_PRIVATE_KEY'].valueString;

  try {
    const client = new Client();

    await client.connect({
      host: host,
      username: user,
      privateKey: key,
      retries: 5,
      retry_factor: 2,
      retry_minTimeout: 1000,
    });

    // Subscription criteria is QuestionnaireResponse
    const { serviceRequest, specimen, patient } = await readExistingResources(event.input, medplum);

    if (!serviceRequest || !specimen || !patient) {
      throw new Error('Could not find ServiceRequest, Specimen, or Patient');
    }

    const orderId = getIdentifier(serviceRequest, 'http://example.com/orderId');
    if (!orderId) {
      throw new Error('Could not find ID for order: ' + getReferenceString(serviceRequest));
    }

    const orderMessage = createOrmMessage(serviceRequest, patient, specimen);
    if (orderMessage) {
      console.log('[ORM Message] Writing Message', `${orderId}.orm`, orderMessage?.toString());
      await writeHL7ToSftp(client, orderMessage, `./in/${orderId}.orm`);
    }
  } catch (error: any) {
    console.error(error.message);
    throw error;
  }
}

export function createOrmMessage(
  serviceRequest: ServiceRequest,
  patient: Patient,
  specimen: Specimen
): Hl7Message | undefined {
  if (!patient.birthDate) {
    throw new Error('Patient missing birth date: ' + getReferenceString(patient));
  }

  const orderId = getIdentifier(serviceRequest, 'http://example.com/orderId');
  if (!orderId) {
    throw new Error('missing order id');
  }

  let collectedDateString = '';
  if (specimen?.collection?.collectedDateTime) {
    collectedDateString = formatDate(new Date(specimen.collection.collectedDateTime));
  } else if (serviceRequest?.meta?.lastUpdated) {
    collectedDateString = formatDate(new Date(serviceRequest.meta.lastUpdated));
  }

  const segments: Hl7Segment[] = [];
  // Set the delimiter character for the HL7 message
  const context = new Hl7Context('\n');

  // Message Header
  // Note: This may differ between HL7v2 versions
  // See: https://hl7-definition.caristix.com/v2/HL7v2.3/Segments/MSH
  segments.push(
    new Hl7Segment([
      'MSH', // MSH
      '^~\\&', // Separators
      '', // Sending App
      FACILITY_CODE, // Sending Facility
      '', // Receiving Application
      'ACME_LAB', // Receiving Facility
      formatDate(new Date()), // Date & Time
      '', // Security ST
      'ORM^O01', // Message Type
      '', // Message Control ID
      'P', // Production/Test
      '2.3', // Version Id
      ...Array(7).fill(''),
    ])
  );

  // PID Segment
  // See: https://hl7-definition.caristix.com/v2/HL7v2.3/Segments/PID
  segments.push(
    new Hl7Segment([
      'PID', // PID
      '1', // Section id
      orderId, // Patient ID (External ID)
      orderId, // Patient ID (Internal ID)
      '', // Alternate Patient Id
      formatName(patient.name?.[0]), // Patient Name
      '', // Mother Maiden Name (N/A)
      formatDate(new Date(patient.birthDate), false), //Date of Birth
      mapGender(patient.gender), // Sex
      '', // Patient Alias (N/A)
      '', // Race (N/A)
      '', // Patient Address
      ...Array(8).fill(''), // Unused fields
    ])
  );

  // Common Order (ORC) segment
  // See: https://hl7-definition.caristix.com/v2/HL7v2.3/Segments/ORC
  segments.push(
    new Hl7Segment([
      'ORC', // ORC
      'NW', // Order Control
      orderId, // Placer Order number
      '', // Filler order number TODO: What is this?
      '', // Placer order number
      'R', // Order Status
      '', // Response Flag
      '', // Quantity/Timing,
      '', // Parent,
      formatDate(new Date()), // Date / time of transaction
      '', // Entered by
      '', // Verified by
      '', // Ordering Provider
      FACILITY_CODE, // Enterer's Location,
      ...new Array(6).fill(''),
    ])
  );

  // OBR- Observation Request
  // See: https://hl7-definition.caristix.com/v2/HL7v2.3/Segments/OBR
  segments.push(
    new Hl7Segment([
      'OBR', // OBR
      '1', // Set ID
      orderId, // Placer Order Number TODO: What is this?
      '', // Filler Order number
      '8167^PANEL B FULL^^PANEL B FULL', // Universal order id
      '', // Priority,
      formatDate(new Date()), // Requested date/time
      collectedDateString, // Collection time
      ...new Array(19).fill(''), // unused fields
      '^^^^^R',
      ...new Array(6).fill(''),
    ])
  );

  return new Hl7Message(segments, context);
}

/* Medplum I/O */

async function readExistingResources(
  response: QuestionnaireResponse,
  medplum: MedplumClient
): Promise<{
  serviceRequest: ServiceRequest | undefined;
  specimen: Specimen | undefined;
  patient: Patient | undefined;
}> {
  const serviceRequest = await medplum.readReference(response.subject as Reference<ServiceRequest>);
  const specimen = await medplum.readReference(serviceRequest.specimen?.[0] as Reference<Specimen>);
  const patient = await medplum.readReference(serviceRequest.subject as Reference<Patient>);

  return { serviceRequest, specimen, patient };
}

/* SFTP I/O */

async function writeHL7ToSftp(client: Client, message: Hl7Message, dstPath: string): Promise<void> {
  try {
    console.log('Writing');
    console.log(message.toString().replaceAll('\r', '\n'));
    await client.put(Buffer.from(message.toString()), dstPath);
  } catch (error) {
    throw new Error(`Error writing to SFTP: ${error}`);
  }
}

/* Helper Functions */

function formatDate(date: Date | undefined, includeTime = true): string {
  if (!date) {
    return '';
  }

  let [dateString, timeString] = date.toISOString().split('T');
  dateString = dateString.replaceAll('-', '');
  timeString = timeString.replaceAll(':', '').substring(0, 4);

  return includeTime ? dateString + timeString : dateString;
}

function formatName(name: HumanName | undefined): string {
  if (!name?.family || !name?.given?.[0]) {
    throw new Error('Could not find name for patient');
  }
  const components = [name.family, name.given?.[0]];
  const middleInitial = name.given?.[1]?.charAt(0);
  if (middleInitial) {
    components.push(middleInitial);
  }

  return new Hl7Field([components]).toString();
}

function mapGender(gender: Patient['gender'] | undefined): string {
  switch (gender?.toLowerCase().at(0)) {
    case 'm':
    case 'f':
      return gender.charAt(0).toUpperCase();
    default:
      return 'U';
  }
}
