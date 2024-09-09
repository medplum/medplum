import {
  BotEvent,
  createReference,
  findResourceByCode,
  getReferenceString,
  Hl7Message,
  Hl7Segment,
  LOINC,
  MedplumClient,
  normalizeErrorString,
  parseHl7DateTime,
  SNOMED,
  streamToBuffer,
  UCUM,
} from '@medplum/core';
import {
  Attachment,
  CodeableConcept,
  DiagnosticReport,
  Media,
  Observation,
  Organization,
  Quantity,
  Range,
  Reference,
  ServiceRequest,
  Specimen,
} from '@medplum/fhirtypes';
import { ReadStream } from 'ssh2';
import { default as SftpClient } from 'ssh2-sftp-client';

// Timezone offset of partner lab
const PARTNER_TIMEZONE = '-05:00';

/**
 * This Bot demonstrates how to read lab results from an SFTP server to create `Observation` and `DiagnosticReport`
 * resources. Incoming data is the the form of HL7v2 ORU messages
 *
 * See: https://v2plus.hl7.org/2021Jan/message-structure/ORU_R01.html
 * @param medplum - The Medplum client
 * @param event - The Bot event
 * @returns The Bot result
 */
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Read SFTP connection data from project secrets (TODO link)
  const host = event.secrets['SFTP_HOST'].valueString;
  const user = event.secrets['SFTP_USER'].valueString;
  const key = event.secrets['SFTP_PRIVATE_KEY'].valueString;

  // Read the `Organization` resource corresponding to this lab
  const performer = await medplum.searchOne('Organization', { name: 'Acme Clinical Labs' });
  if (!performer) {
    throw new Error(`Could not find Organization ${performer}`);
  }

  // Connect to SFTP
  const sftp = new SftpClient();

  try {
    console.log('Connecting to SFTP...');
    // Connect to SFTP server
    await sftp.connect({
      host: host,
      username: user,
      privateKey: key,
      retries: 5,
      retry_factor: 2,
      retry_minTimeout: 2000,
    });

    // Read *.oru files from SFTP server
    const fileContents = await readSFTPDirectory(sftp, 'out');

    // Parse file contents into structured Hl7Message objects
    const messages = fileContents.map(Hl7Message.parse);

    for (const message of messages) {
      try {
        await processOruMessage(medplum, message, performer);
      } catch (err: any) {
        console.error(err.message);
      }
    }
  } catch (error: any) {
    console.error(error.message);
    throw error;
  } finally {
    console.log('Closing SFTP connection');
    await sftp.end();
  }
}
/**
 * Parses patient lab results from an HL7 ORU message (https://v2plus.hl7.org/2021Jan/message-structure/ORU_R01.html)
 * based on mappings between Hl7v2 and FHIR (https://build.fhir.org/ig/HL7/v2-to-fhir/segment_maps.html) to create
 * and/or update FHIR ServiceRequest, DiagnosticReport, and Observation resources
 *
 * Note: While ORU is an HL7 standard, every LIS/EHR system implements the standard in a slightly different way
 *
 * @param medplum - The Medplum Client object
 * @param message - Parsed ORU message.
 * @param performer - The `Organization` resource corresponding to the lab that performed the test.
 */
export async function processOruMessage(
  medplum: MedplumClient,
  message: Hl7Message,
  performer: Organization
): Promise<void> {
  // Parse the HL7 MSH segment
  // See: https://v2plus.hl7.org/2021Jan/segment-definition/MSH.html
  const messageType = message.header.getComponent(9, 1);

  // Message type should be "ORU"
  if (messageType !== 'ORU') {
    const err = new Error('Invalid message type: ' + messageType);
    throw err;
  }

  // Parse the HL7 PID segment to read the patient id
  // See: https://v2plus.hl7.org/2021Jan/segment-definition/PID.html
  const orderId = message.getSegment('PID')?.getComponent(2, 1);

  if (!orderId || orderId.length === 0) {
    throw new Error('Missing order id');
  }

  // Find the existing `ServiceRequest` (i.e. lab order) with this id
  const serviceRequest = await medplum.searchOne('ServiceRequest', `identifier=${orderId}`);

  if (!serviceRequest) {
    throw new Error(`Could not find ServiceRequest with id ${orderId}`);
  } else {
    console.log(`Processing order with id ${orderId}...`);
  }

  // Find any existing `Observation`, `DiagnosticReport`, and `Specimen` resources associated with this order
  const existingObservations = await medplum.searchResources('Observation', {
    'based-on': getReferenceString(serviceRequest),
  });
  const existingReport = await medplum.searchOne('DiagnosticReport', `based-on=${getReferenceString(serviceRequest)}`);
  let existingSpecimens: Specimen[] = [];
  if (serviceRequest.specimen) {
    existingSpecimens = await Promise.all(
      serviceRequest.specimen.map((specimenRef) => medplum.readReference(specimenRef))
    );
  }

  // Update the collection date of each specimen associated with the order
  // See: https://v2plus.hl7.org/2021Jan/segment-definition/OBR.html
  const collectionDate = parseHl7DateTime(message.getSegment('OBR')?.getField(14)?.toString(), {
    tzOffset: PARTNER_TIMEZONE,
  });

  if (collectionDate) {
    await Promise.all(
      existingSpecimens.map(async (specimen) => {
        specimen.receivedTime = collectionDate;
      })
    );
  }

  // Create / Update the observations
  let observations = processObxSegments(message, serviceRequest, performer);

  // If there's an existing report, just update it with the new values
  const report: DiagnosticReport = existingReport ?? {
    resourceType: 'DiagnosticReport',
    status: 'preliminary',
    code: serviceRequest.code as CodeableConcept,
    subject: serviceRequest.subject,
    basedOn: [createReference(serviceRequest)],
    performer: [createReference(performer)],
  };

  // Check to see if the order was cancelled
  await handleOrderCancellation(medplum, message, serviceRequest, observations, report, existingSpecimens);

  // Upload any embedded PDF reports, and attach them to the DiagnosticReport
  await uploadEmbeddedPdfs(medplum, report, `report_${orderId}.pdf`, message);

  // Update observations in Medplum
  observations = await Promise.all(
    observations.map((obs) => createOrUpdateObservation(medplum, obs, existingObservations))
  );

  // Update the DiagnosticReport in medplum
  report.result = observations.map(createReference);
  if (existingReport) {
    await medplum.updateResource(report);
  } else {
    await medplum.createResource(report);
  }

  // Update the Specimens in Medplum
  for (const specimen of existingSpecimens) {
    await medplum.updateResource(specimen);
  }
}

/**
 * Check if the order was cancelled and set the appropriate status fields if so
 * @param medplum - MedplumClient object
 * @param message - parsed HL7 message
 * @param serviceRequest - `ServiceRequest` representing this order
 * @param observations - parsed `Observation` resources
 * @param report - `DiagnosticReport` for these results
 * @param specimens - `Specimen` associated with the results
 */
async function handleOrderCancellation(
  medplum: MedplumClient,
  message: Hl7Message,
  serviceRequest: ServiceRequest,
  observations: Observation[],
  report: DiagnosticReport,
  specimens: Specimen[]
): Promise<void> {
  const cancellationReason = await getCancellationReason(medplum, message, serviceRequest);

  // Set the `Observation.dataAbsentReason` on all cancelled orders
  for (const observation of observations) {
    if (observation.status === 'cancelled') {
      observation.dataAbsentReason = cancellationReason;
    }
  }
  // Mark the report as cancelled if a cancellation reason was found
  report.status = cancellationReason ? 'cancelled' : 'preliminary';

  // Mark the specimen as unsatisfactory
  for (const specimen of specimens) {
    specimen.status = 'unsatisfactory';
    if (cancellationReason) {
      specimen.condition = [cancellationReason];
    }
  }
}

/**
 * Check to see if the order was cancelled. If so, return the cancellation reason
 *
 * @param medplum - The MedplumClient object.
 * @param message - The parsed HL7 message.
 * @param serviceRequest - The ServiceRequest resource.
 * @returns The cancellation reason, if any.
 */
async function getCancellationReason(
  medplum: MedplumClient,
  message: Hl7Message,
  serviceRequest: ServiceRequest
): Promise<CodeableConcept | undefined> {
  // Read the first OBR Segment to find the order status
  // See: https://v2plus.hl7.org/2021Jan/segment-definition/OBR.html
  const obrIndex = message.segments.findIndex((segment) => segment.name === 'OBR');
  const obr = message.getSegment(obrIndex);
  const obrStatus = OBSERVATION_STATUS[obr?.getComponent(25, 1) as string];

  const isCancelled = obrStatus === 'cancelled';

  // If the order was cancelled, read the following note (NTE) segment to extract the cancellation reason
  // Note: How this cancellation reason is sent will differ across LIS/EHR systems
  if (isCancelled) {
    const obrNote = message.getSegment(obrIndex + 1) as Hl7Segment;
    const noteText = obrNote.getField(3).toString().toUpperCase();
    // Create a note on the order to describe the cancellation reason
    if (!serviceRequest.note) {
      serviceRequest.note = [];
    }
    serviceRequest.note.push({ text: `Order Cancelled by Partner Lab: ${noteText}` });
    await medplum.updateResource(serviceRequest);
    return CANCELLATION_REASONS[noteText];
  }
  return undefined;
}

/* SFTP Handling Code */

async function readSFTPDirectory(sftp: SftpClient, dir: string, batchSize = 25): Promise<string[]> {
  const results: string[] = [];

  // List all *.oru files in directory
  const fileList = await sftp.list(dir, (fileInfo) => fileInfo.name.endsWith('oru'));

  // Read all files. To avoid overwhelming the SFTP server, read in batches of `batchSize` in parallel
  for (let i = 0; i < fileList.length; i += batchSize) {
    await Promise.allSettled(
      fileList.slice(i, i + batchSize).map(async (fileInfo): Promise<Buffer> => {
        // Read each file as a `Buffer` object
        const filePath = `${dir}/${fileInfo.name}`;
        let stream: ReadStream | undefined;
        let result: Buffer | undefined = undefined;
        try {
          stream = sftp.createReadStream(filePath);
          result = await streamToBuffer(stream);
        } catch (err) {
          // Throw any errors related to file reading
          console.error(`[${filePath}] Error processing file: ${normalizeErrorString(err)}`);
          throw err;
        } finally {
          if (stream) {
            stream.destroy();
          }
        }

        return result;
      })
    ).then((outcomes: PromiseSettledResult<Buffer>[]) => {
      // Convert every file that was successfully read to a string to return
      for (const outcome of outcomes) {
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value.toString('utf-8'));
        }
      }
    });
  }
  return results;
}

/**
 * Loop through all the segments (i.e. lines) and convert the OBX segments into FHIR Observations
 * Some observations have notes that are stored in subsequent lines, so we need to keep a pointer to the last
 * processed observation
 *
 * @param message - Parsed HL7 Message
 * @param serviceRequest - Current `ServiceRequest` representing the lab order
 * @param performer - A reference to the performing lab
 * @returns An array of `Observation` resources.
 */
function processObxSegments(
  message: Hl7Message,
  serviceRequest: ServiceRequest,
  performer: Organization
): Observation[] {
  const observations: Observation[] = [];
  let prevObservation: Observation | undefined;

  // Loop through all segments, handling observation segments (OBX) and note segments (nte)
  for (const segment of message.segments) {
    if (segment.name === 'OBX') {
      // We're starting to process a new observation, so enqueue the previous observation
      if (prevObservation) {
        observations.push(prevObservation);
      }

      prevObservation = processObservation(segment, serviceRequest, performer);
    } else if (segment.name === 'NTE') {
      // Handle associated notes
      // See https://v2plus.hl7.org/2021Jan/segment-definition/NTE.html
      const noteText = segment.getComponent(3, 1).toString();

      if (!prevObservation) {
        console.warn(`Warning: Received the following note with no observation: '${noteText}'`);
        continue;
      }
      if (!prevObservation?.note) {
        prevObservation.note = [];
      }
      prevObservation.note.push({ text: noteText });
    }
  }

  if (prevObservation) {
    observations.push(prevObservation);
  }

  return observations;
}

/**
 * Convert an OBX segment into a FHIR `Observation` resource. This function handles two different types of OBX messages
 * NM - Numerical Observations
 * ST - Structured text observations.
 *
 * Note that some systems send numerical values with comparators (e.g. <, >) as structured text fields
 *
 * @param segment - The OBX segment to convert.
 * @param serviceRequest - The current `ServiceRequest` representing the lab order.
 * @param performer - The performing lab.
 * @returns The converted `Observation` resource.
 */
function processObservation(
  segment: Hl7Segment,
  serviceRequest: ServiceRequest,
  performer: Organization
): Observation | undefined {
  // Convert the reported code into a standard LOINC code
  // Note: The reported coding scheme will vary across labs
  const reportedCode = segment.getComponent(3, 4);
  const code = LOINC_CODES[reportedCode];

  if (!code) {
    console.error(`Unrecognized code '${segment.getField(3)?.toString()}'. Skipping....`);
    return undefined;
  }

  const observation: Observation = {
    resourceType: 'Observation',
    basedOn: [createReference(serviceRequest)],
    code,
    subject: serviceRequest.subject,
    status: OBSERVATION_STATUS[segment.getComponent(11, 1)],
    issued: parseHl7DateTime(segment.getComponent(14, 1)),

    performer: [createReference(performer)],
    specimen: serviceRequest.specimen?.[0],
  };

  // Extract numerical value and units
  const valueType = segment.getComponent(2, 1);
  const value = segment.getComponent(5, 1);
  const unit = segment.getComponent(6, 1);
  const refRange = segment.getComponent(7, 1);
  let quantity: Quantity | undefined = { unit, system: UCUM };
  let interpretation: CodeableConcept | undefined;

  if (valueType === 'NM') {
    // If it's a numerical observation, populate a valueQuantity
    interpretation = INTERPRETATION_CODES[segment.getComponent(8, 1)];
    quantity.value = Number.parseFloat(value);
  } else if (valueType === 'ST') {
    // If it's a structured text field, check for the following conditions:
    // 1. Unable to calculate (Note: Different labs will represent this differently)
    // 2. Cancelled
    // 3. Numerical value with a comparator (<, >, <=, >=)
    if (value === 'UNABLE TO CALCULATE') {
      quantity = undefined;
      observation.dataAbsentReason = { text: 'Result Blanked by Partner Lab' };
    } else if (observation.status !== 'cancelled') {
      quantity = { ...quantity, ...parseValueWithComparator(value) };
      interpretation = INTERPRETATION_CODES[segment.get(8).get(0)];
    }
  }

  Object.assign(observation, {
    referenceRange: [parseReferenceRange(refRange, unit)],
    interpretation: interpretation && [interpretation],
    valueQuantity: quantity,
  });

  return observation;
}

/**
 * Check if there is an existing `Observation` resource with the same LOINC code, and update if necessary
 * @param medplum - The Medplum Client
 * @param updatedObservation - The latest `Observation`
 * @param existingObservations - The existing `Observation` on the server
 * @returns The updated `Observation` resource.
 */
function createOrUpdateObservation(
  medplum: MedplumClient,
  updatedObservation: Observation,
  existingObservations: Observation[]
): Promise<Observation> {
  const existingObservation = findResourceByCode(
    existingObservations,
    updatedObservation.code as CodeableConcept,
    LOINC
  );
  if (existingObservation) {
    return medplum.updateResource({
      ...(existingObservation as Observation),
      ...updatedObservation,
    });
  }
  return medplum.createResource(updatedObservation);
}

/**
 * Upload any embedded rendered PDF reports in the HL7 message as a FHIR `Media` resource
 * and attach it to the diagnostic report in the `DiagnosticReport.presentedForm` property
 * @param medplum - The Medplum Client.
 * @param report - The current `DiagnosticReport` resource.
 * @param fileName - The name of the PDF file.
 * @param message - The HL7 message.
 * @returns The uploaded `Media` resources.
 */
async function uploadEmbeddedPdfs(
  medplum: MedplumClient,
  report: DiagnosticReport,
  fileName: string,
  message: Hl7Message
): Promise<Media[]> {
  // Upload PDF reports
  const pdfLines = message.segments.filter((seg) => seg.getComponent(3, 2) === 'PDFBASE64');
  const media = await Promise.all(
    pdfLines.map(async (segment: Hl7Segment) => {
      const encodedData = segment.getComponent(5, 5);
      const decodedData = Buffer.from(encodedData, 'base64');
      return medplum.uploadMedia(decodedData, 'application/pdf', fileName, {
        subject: report.subject,
        basedOn: report.basedOn as Reference<ServiceRequest>[],
      });
    })
  );

  if (media.length > 0) {
    if (!report.presentedForm) {
      report.presentedForm = [];
    }
    report.presentedForm.push(...media.filter((m) => m.content).map((m) => m.content as Attachment));
  }

  return media;
}

/* Parsing Utilities */

function parseValueWithComparator(value: string): Quantity | undefined {
  const match = value.match(/([<>][=]?)(\d+(\.\d+)?)/);
  if (match) {
    return {
      comparator: match[1] as Quantity['comparator'],
      value: Number.parseFloat(match[2]),
    };
  }
  return undefined;
}

function parseReferenceRange(rangeString: string, unit: string): Range {
  rangeString = rangeString.trim();
  const system = UCUM;
  if (rangeString.includes('-')) {
    const [low, high, ..._] = rangeString.split('-');
    return {
      low: { value: Number.parseFloat(low), unit, system },
      high: { value: Number.parseFloat(high), unit, system },
    };
  }

  for (const comparator of ['<=', '>=', '<', '>']) {
    if (rangeString.startsWith(comparator)) {
      const side = comparator.includes('<') ? 'high' : 'low';
      return {
        [side]: {
          value: Number.parseFloat(rangeString.substring(comparator.length)),
          unit,
          system,
          comparator: rangeString.substring(0, comparator?.length) as Quantity['comparator'],
        },
      };
    }
  }

  return {};
}

/** Code Mappings */
const INTERPRETATION_CODES: Record<string, CodeableConcept> = {
  '': {
    text: 'Normal',
    coding: [
      {
        display: 'Normal',
        code: 'N',
        system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
      },
    ],
  },
  H: {
    text: 'High',
    coding: [
      {
        display: 'High',
        code: 'H',
        system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
      },
    ],
  },
  HH: {
    text: '	Critical high',
    coding: [
      {
        display: 'Critical high',
        code: 'HH',
        system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
      },
    ],
  },
  L: {
    text: 'Low',
    coding: [
      { display: 'Low', code: 'L', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
    ],
  },
  LL: {
    text: 'Critical low',
    coding: [
      {
        display: 'Critical low',
        code: 'LL',
        system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
      },
    ],
  },
  A: {
    text: 'Abnormal',
    coding: [
      {
        display: 'Abnormal',
        code: 'A',
        system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
      },
    ],
  },
  AA: {
    text: 'Critical abnormal',
    coding: [
      {
        display: 'Critical abnormal',
        code: 'AA',
        system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
      },
    ],
  },
};

const OBSERVATION_STATUS: Record<string, Observation['status']> = {
  F: 'final',
  I: 'registered',
  P: 'preliminary',
  C: 'corrected',
  X: 'cancelled',
};

const LOINC_CODES: Record<string, CodeableConcept> = {
  BUN: {
    coding: [
      {
        system: LOINC,
        code: 'BUN',
        display: 'BUN',
      },
    ],
    text: 'BUN',
  },
  CHOL: {
    coding: [
      {
        system: LOINC,
        code: 'CHOL',
        display: 'CHOL',
      },
    ],
    text: 'CHOL',
  },
  CREA: {
    coding: [
      {
        system: LOINC,
        code: 'CREAT',
        display: 'CREAT',
      },
    ],
    text: 'CREAT',
  },
  HDLC3: {
    coding: [
      {
        system: LOINC,
        code: 'HDL',
        display: 'HDL',
      },
    ],
    text: 'HDL',
  },
  TRIG: {
    coding: [
      {
        system: LOINC,
        code: 'TRIG',
        display: 'TRIG',
      },
    ],
    text: 'TRIG',
  },
  TSH: {
    coding: [
      {
        system: LOINC,
        code: 'TSH',
        display: 'TSH',
      },
    ],
    text: 'TSH',
  },
  DLDL: {
    coding: [
      {
        system: LOINC,
        code: 'LDL',
        display: 'LDL-direct',
      },
    ],
    text: 'LDL-direct',
  },
  HGBA1C: {
    coding: [
      {
        system: LOINC,
        code: 'HBA1C',
        display: 'HBA1C',
      },
    ],
    text: 'HBA1C',
  },
  LDL: {
    coding: [
      {
        system: LOINC,
        code: 'LDL-CALCULATED',
        display: 'LDL-CALCULATED',
      },
    ],
    text: 'LDL-CALCULATED',
  },
};

export const CANCELLATION_REASONS: Record<string, CodeableConcept> = {
  CLOTTING: {
    text: 'Clotting',
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
        code: 'RC',
        display: 'Clotting',
      },
      {
        system: SNOMED,
        code: '281279002',
        display: 'Sample clotted',
      },
    ],
  },
  'QUANTITY NOT SUFFICIENT': {
    text: 'Quantity Not Sufficient',
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
        code: 'QS',
        display: 'Quantity not sufficient',
      },
      {
        system: SNOMED,
        code: '281268007',
        display: 'Insufficient sample',
      },
    ],
  },
  'SAMPLE GROSSLY HEMOLYZED': {
    text: 'Hemolysis',
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
        code: 'RH',
        display: 'Hemolysis',
      },
      {
        system: SNOMED,
        code: '281288006',
        display: 'Sample grossly hemolyzed',
      },
    ],
  },
  'SAMPLE STABILITY EXPIRED': {
    text: 'Expired',
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
        code: 'EX',
        display: 'Expired',
      },
    ],
  },
  'SAMPLE MISLABELED': {
    text: 'Labeling',
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
        code: 'RM',
        display: 'Labeling',
      },
      {
        system: SNOMED,
        code: '281265005',
        display: 'Sample incorrectly labeled',
      },
    ],
  },
  'IMPROPER STORAGE': {
    text: 'Improper Storage',
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0490',
        code: 'RR',
        display: 'Improper Storage',
      },
    ],
  },
};
