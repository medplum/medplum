import {
  BotEvent,
  formatHl7DateTime,
  getReferenceString,
  getIdentifier,
  Hl7Context,
  Hl7Field,
  Hl7Message,
  Hl7Segment,
  MedplumClient,
} from '@medplum/core';
import {
  DiagnosticReport,
  Observation,
  Patient,
  Practitioner,
  Reference,
  ServiceRequest,
  Specimen,
  Attachment,
  HumanName,
} from '@medplum/fhirtypes';

// Constants
const FACILITY_CODE = 'MEDPLUM_LAB';
const FACILITY_URL = 'https://lab.medplum.com';
const FACILITY_ORDER_ID = new URL('orderId', FACILITY_URL).toString();
const FACILITY_PATIENT_ID = new URL('patientId', FACILITY_URL).toString();

/**
 * This Bot demonstrates how to create and send lab results in the form of HL7v2 ORU messages
 *
 * See: https://v2plus.hl7.org/2021Jan/message-structure/ORU_R01.html
 *
 * @param medplum - The Medplum Client object
 * @param event - The BotEvent object
 * @returns The result of the operation
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent<DiagnosticReport>
): Promise<Hl7Message | undefined> {
  try {
    // The event input is a DiagnosticReport
    const diagnosticReport = event.input;

    // Get the related resources
    const { serviceRequest, observations, specimen, patient, interpreter, presentedFormAttachments } =
      await fetchRelatedResources(diagnosticReport, medplum);

    if (!serviceRequest || !patient) {
      throw new Error('Could not find required resources for ORU message');
    }

    // Get the order ID from the ServiceRequest
    const orderId = getIdentifier(serviceRequest, FACILITY_ORDER_ID);
    if (!orderId) {
      throw new Error(`No order ID found for ServiceRequest: ${getReferenceString(serviceRequest)}`);
    }

    // Create the ORU message
    const oruMessage = createOruMessage(
      diagnosticReport,
      serviceRequest,
      observations,
      specimen,
      patient,
      interpreter,
      presentedFormAttachments
    );

    return oruMessage;
  } catch (error: any) {
    console.error(error.message);
    throw error;
  }
}

/**
 * Fetches all the resources needed to create an ORU message
 *
 * @param diagnosticReport - The DiagnosticReport resource
 * @param medplum - The Medplum client
 * @returns The related resources
 */
async function fetchRelatedResources(
  diagnosticReport: DiagnosticReport,
  medplum: MedplumClient
): Promise<{
  serviceRequest?: ServiceRequest;
  observations: Observation[];
  specimen?: Specimen;
  patient?: Patient;
  interpreter?: Practitioner;
  presentedFormAttachments?: Attachment[];
}> {
  // Get the ServiceRequest from the basedOn reference
  let serviceRequest: ServiceRequest | undefined;
  if (diagnosticReport.basedOn && diagnosticReport.basedOn.length > 0) {
    try {
      serviceRequest = await medplum.readReference(diagnosticReport.basedOn[0] as Reference<ServiceRequest>);
    } catch (err) {
      console.warn('Could not find ServiceRequest', err);
    }
  }

  // Get all Observations referenced in the report
  const observations: Observation[] = [];
  if (diagnosticReport.result && diagnosticReport.result.length > 0) {
    await Promise.all(
      diagnosticReport.result.map(async (obsRef) => {
        try {
          const obs = await medplum.readReference(obsRef as Reference<Observation>);
          observations.push(obs);

          // If this observation has child observations, fetch them as well
          if (obs.hasMember && obs.hasMember.length > 0) {
            await Promise.all(
              obs.hasMember.map(async (memberRef) => {
                try {
                  const childObs = await medplum.readReference(memberRef as Reference<Observation>);
                  observations.push(childObs);
                } catch (err) {
                  console.warn(`Could not find child Observation: ${getReferenceString(memberRef)}`, err);
                }
              })
            );
          }
        } catch (err) {
          console.warn(`Could not find Observation: ${getReferenceString(obsRef)}`, err);
        }
      })
    );
  }

  // Get the Specimen if available
  let specimen: Specimen | undefined;
  if (serviceRequest?.specimen && serviceRequest.specimen.length > 0) {
    try {
      specimen = await medplum.readReference(serviceRequest.specimen[0] as Reference<Specimen>);
    } catch (err) {
      console.warn('Could not find Specimen', err);
    }
  }

  // Get the Patient
  let patient: Patient | undefined;
  if (diagnosticReport.subject) {
    try {
      patient = await medplum.readReference(diagnosticReport.subject as Reference<Patient>);
    } catch (err) {
      console.warn('Could not find Patient', err);
    }
  }

  // Get the Interpreter (Practitioner)
  let interpreter: Practitioner | undefined;
  if (diagnosticReport?.resultsInterpreter?.[0]) {
    try {
      interpreter = await medplum.readReference(diagnosticReport.resultsInterpreter[0] as Reference<Practitioner>);
    } catch (err) {
      console.warn('Could not find Interpreter', err);
    }
  }

  // Get the PDF attachments content as base64 encoded strings
  let presentedFormAttachments: Attachment[] = [];
  if (diagnosticReport.presentedForm) {
    presentedFormAttachments = await Promise.all(
      diagnosticReport.presentedForm
        .filter((form) => form.contentType === 'application/pdf')
        .map(async (form) => {
          if (form.data) {
            // If data is directly provided, clean up the data URL prefix
            return {
              ...form,
              data: form.data.replace(/^data:.*?;base64,/, ''),
            };
          }
          // If URL is provided, fetch the contents and return the base64 encoded string
          if (!form.url) {
            throw new Error('PDF attachment must have either data or url');
          }
          const binaryData = await medplum.download(form.url);
          const arrayBuffer = await binaryData.arrayBuffer();
          const base64Content = Buffer.from(arrayBuffer).toString('base64');
          return {
            ...form,
            data: base64Content,
          };
        })
    );
  }

  return { serviceRequest, observations, specimen, patient, interpreter, presentedFormAttachments };
}

/**
 * Creates an HL7 ORU message from FHIR resources
 *
 * @param diagnosticReport - The DiagnosticReport resource
 * @param serviceRequest - The ServiceRequest resource
 * @param observations - The Observation resources
 * @param specimen - The Specimen resource (optional)
 * @param patient - The Patient resource
 * @param interpreter - The ordering Practitioner (optional)
 * @param presentedFormAttachments - The PDF attachments
 * @returns The HL7 ORU message
 */
export function createOruMessage(
  diagnosticReport: DiagnosticReport,
  serviceRequest: ServiceRequest,
  observations: Observation[],
  specimen?: Specimen,
  patient?: Patient,
  interpreter?: Practitioner,
  presentedFormAttachments?: Attachment[]
): Hl7Message | undefined {
  if (!patient) {
    console.error('Patient resource is required for ORU message');
    return undefined;
  }

  const orderId = getIdentifier(serviceRequest, FACILITY_ORDER_ID);
  if (!orderId) {
    console.error('Order ID not found in ServiceRequest');
    return undefined;
  }

  const segments: Hl7Segment[] = [];
  // Use newline as the segment separator
  const context = new Hl7Context('\n');
  const now = new Date();

  // Message Header (MSH)
  segments.push(
    new Hl7Segment([
      'MSH', // MSH
      '^~\\&', // Field separator and encoding characters
      'MEDPLUM_LAB', // Sending application
      FACILITY_CODE, // Sending facility
      '', // Receiving application
      'RECEIVING_FACILITY', // Receiving facility
      formatHl7DateTime(now), // Date/time of message
      '', // Security
      'ORU^R01', // Message type^Event type
      generateMessageId(), // Message control ID
      'P', // Processing ID (P = Production)
      '2.5', // HL7 version
      ...Array(7).fill(''), // Additional optional fields
    ])
  );

  // Patient Identification (PID)
  segments.push(createPidSegment(patient));

  // Patient Visit (PV1)
  if (serviceRequest.encounter) {
    segments.push(createPv1Segment(interpreter));
  }

  // Order Observation (OBR)
  segments.push(createObrSegment(diagnosticReport, serviceRequest, specimen));

  // Add observations (OBX segments)
  observations.forEach((observation, index) => {
    const obxSegments = createObxSegments(observation, index + 1);
    segments.push(...obxSegments);

    // Add notes as NTE segments if present
    if (observation.note && observation.note.length > 0) {
      observation.note.forEach((note, noteIndex) => {
        if (note.text) {
          segments.push(createNteSegment(note.text, noteIndex + 1));
        }
      });
    }
  });

  // Add diagnostic report presented for as OBX segment, with base64 encoded contents
  if (presentedFormAttachments) {
    const obxIndex = observations.length;
    presentedFormAttachments.map((form, index) => {
      const segment = createObxPdfSegment(form, obxIndex + index + 1);
      segments.push(segment);
      return segment;
    });
  }

  return new Hl7Message(segments, context);
}

/**
 * Creates a PID (Patient Identification) segment
 *
 * @param patient - The Patient resource
 * @returns An HL7 PID segment
 */
function createPidSegment(patient: Patient): Hl7Segment {
  const patientIdentifier = getIdentifier(patient, FACILITY_PATIENT_ID) || '';

  return new Hl7Segment([
    'PID', // PID
    '1', // Set ID
    patientIdentifier, // Patient ID (External ID)
    '', // Patient ID (Internal ID)
    '', // Alternate Patient ID
    formatHl7Name(patient.name?.[0]), // Patient Name
    '', // Mother's Maiden Name
    patient.birthDate || '', // Date of Birth (YYYYMMDD)
    mapFhirGender(patient.gender), // Sex
    '', // Patient Alias
    '', // Race
    formatHl7Address(patient.address?.[0]), // Patient Address
    '', // County Code
    formatHl7Telecom(patient.telecom, 'phone', 'home'), // Home Phone
    formatHl7Telecom(patient.telecom, 'phone', 'work'), // Business Phone
    '', // Primary Language
    '', // Marital Status
    '', // Religion
    '', // Patient Account Number
    '', // SSN Number - Patient
    '', // Driver's License - Patient
  ]);
}

/**
 * Creates a PV1 (Patient Visit) segment
 *
 * @param interpreter - The ordering Practitioner
 * @returns An HL7 PV1 segment
 */
function createPv1Segment(interpreter?: Practitioner): Hl7Segment {
  return new Hl7Segment([
    'PV1', // PV1
    '1', // Set ID
    'O', // Patient Class (O = Outpatient)
    '', // Assigned Patient Location
    '', // Admission Type
    '', // Preadmit Number
    '', // Prior Patient Location
    interpreter ? formatHl7Provider(interpreter) : '', // Attending Doctor
    '', // Referring Doctor
    '', // Consulting Doctor
    '', // Hospital Service
    '', // Temporary Location
    '', // Preadmit Test Indicator
    '', // Readmission Indicator
    '', // Admit Source
    '', // Discharge Disposition
    '', // Discharge To Location
    '', // Diet Type
    '', // Servicing Facility
  ]);
}

/**
 * Creates an OBR (Observation Request) segment
 *
 * @param diagnosticReport - The DiagnosticReport resource
 * @param serviceRequest - The ServiceRequest resource
 * @param specimen - The Specimen resource (optional)
 * @returns An HL7 OBR segment
 */
function createObrSegment(
  diagnosticReport: DiagnosticReport,
  serviceRequest: ServiceRequest,
  specimen?: Specimen
): Hl7Segment {
  const orderId = getIdentifier(serviceRequest, FACILITY_ORDER_ID) || '';
  let collectionDateTime = '';

  if (specimen?.collection?.collectedDateTime) {
    collectionDateTime = formatHl7DateTime(new Date(specimen.collection.collectedDateTime));
  }

  const reportStatus = mapFhirStatusToHl7(diagnosticReport.status);

  return new Hl7Segment([
    'OBR', // OBR
    '1', // Set ID
    orderId, // Placer Order Number
    '', // Filler Order Number
    formatHl7CodeableConcept(diagnosticReport.code), // Universal Service ID
    '', // Priority
    '', // Requested Date/Time
    collectionDateTime, // Observation Date/Time
    '', // Observation End Date/Time
    '', // Collection Volume
    '', // Collector Identifier
    '', // Specimen Action Code
    '', // Danger Code
    '', // Relevant Clinical Info
    '', // Specimen Received Date/Time
    '', // Specimen Source
    '', // Ordering Provider
    '', // Order Callback Phone Number
    '', // Placer Field 1
    '', // Placer Field 2
    '', // Filler Field 1
    '', // Filler Field 2
    formatHl7DateTime(new Date(diagnosticReport.issued || '')), // Results Rpt/Status Chng - Date/Time
    '', // Charge to Practice
    '', // Diagnostic Serv Sect ID
    reportStatus, // Result Status
  ]);
}

/**
 * Creates OBX (Observation Result) segments for an Observation
 *
 * @param observation - The Observation resource
 * @param setId - The set ID for this observation
 * @returns An array of HL7 OBX segments
 */
function createObxSegments(observation: Observation, setId: number): Hl7Segment[] {
  const segments: Hl7Segment[] = [];
  const valueType = determineObxValueType(observation);
  const status = mapFhirStatusToHl7(observation.status);

  // Create the main OBX segment
  segments.push(
    new Hl7Segment([
      'OBX', // OBX
      setId.toString(), // Set ID
      valueType, // Value Type
      formatHl7CodeableConcept(observation.code), // Observation Identifier
      '', // Observation Sub-ID
      formatObservationValue(observation, valueType), // Observation Value
      formatHl7Unit(observation.valueQuantity?.unit), // Units
      formatReferenceRange(observation.referenceRange), // Reference Range
      formatHl7Interpretation(observation.interpretation), // Abnormal Flags
      '', // Probability
      '', // Nature of Abnormal Test
      status, // Observation Result Status
      '', // Date Last Observation Normal Value
      '', // User Defined Access Checks
      formatHl7DateTime(new Date(observation.issued || '')), // Date/Time of the Observation
      '', // Producer's ID
      '', // Responsible Observer
      '', // Observation Method
    ])
  );

  // If there's a PDF or other media attachment, add additional OBX segments
  if (observation.hasMember) {
    // This would handle any OBX segments for attachments
    // Implementation would depend on your specific requirements
  }

  return segments;
}

/**
 * Creates an NTE (Notes and Comments) segment
 *
 * @param text - The note text
 * @param setId - The set ID for this note
 * @returns An HL7 NTE segment
 */
function createNteSegment(text: string, setId: number): Hl7Segment {
  return new Hl7Segment([
    'NTE', // NTE
    setId.toString(), // Set ID
    '', // Source of Comment
    text, // Comment
  ]);
}

/* Helper Functions */

/**
 * Generates a unique message ID for the HL7 message
 *
 * @returns A unique message ID
 */
function generateMessageId(): string {
  return 'MEDPLUM_' + Date.now().toString();
}

/**
 * Formats a FHIR HumanName into an HL7 field
 *
 * @param name - The FHIR HumanName
 * @returns The formatted HL7 name field
 */
function formatHl7Name(name: HumanName | undefined): string {
  if (!name) {
    return '';
  }

  const family = name.family || '';
  const given = name.given?.[0] || '';
  const middle = name.given?.[1] || '';
  const prefix = name.prefix?.[0] || '';
  const suffix = name.suffix?.[0] || '';

  // Format: last^first^middle^suffix^prefix
  return new Hl7Field([[family, given, middle, suffix, prefix]]).toString();
}

/**
 * Formats a FHIR Address into an HL7 field
 *
 * @param address - The FHIR Address
 * @returns The formatted HL7 address field
 */
function formatHl7Address(address: any): string {
  if (!address) {
    return '';
  }

  const street = address.line?.[0] || '';
  const otherStreet = address.line?.[1] || '';
  const city = address.city || '';
  const state = address.state || '';
  const zip = address.postalCode || '';
  const country = address.country || '';

  // Format: street^otherStreet^city^state^zip^country
  return new Hl7Field([[street, otherStreet, city, state, zip, country]]).toString();
}

/**
 * Formats FHIR ContactPoint array into a specific type/use
 *
 * @param telecom - The FHIR ContactPoint array
 * @param system - The system to filter by (e.g., 'phone', 'email')
 * @param use - The use to filter by (e.g., 'home', 'work')
 * @returns The formatted telephone number
 */
function formatHl7Telecom(telecom: any[] | undefined, system: string, use: string): string {
  if (!telecom?.length) {
    return '';
  }

  const contact = telecom.find((t) => t.system === system && t.use === use);
  return contact?.value || '';
}

/**
 * Maps FHIR gender to HL7 gender code
 *
 * @param gender - The FHIR gender
 * @returns The HL7 gender code
 */
function mapFhirGender(gender: string | undefined): string {
  switch (gender?.toLowerCase()) {
    case 'male':
      return 'M';
    case 'female':
      return 'F';
    case 'other':
      return 'O';
    default:
      return 'U';
  }
}

/**
 * Formats a FHIR CodeableConcept into an HL7 field
 *
 * @param concept - The FHIR CodeableConcept
 * @returns The formatted HL7 field
 */
function formatHl7CodeableConcept(concept: any): string {
  if (!concept?.coding?.length) {
    return '';
  }

  const coding = concept.coding[0];
  const code = coding.code || '';
  const display = coding.display || concept.text || '';
  const system = coding.system || '';

  // Format: code^text^coding system
  return new Hl7Field([[code, display, system]]).toString();
}

/**
 * Formats a FHIR Practitioner into an HL7 provider field
 *
 * @param practitioner - The FHIR Practitioner
 * @returns The formatted HL7 provider field
 */
function formatHl7Provider(practitioner: Practitioner): string {
  if (!practitioner?.identifier?.length) {
    return '';
  }

  const id = practitioner.identifier[0].value || '';
  const name = practitioner.name?.[0];

  if (!name) {
    return id;
  }

  const family = name.family || '';
  const given = name.given?.[0] || '';
  const middle = name.given?.[1] || '';

  // Format: ID^LastName^FirstName^MiddleInitial
  return new Hl7Field([[id], [family], [given], [middle]]).toString();
}

/**
 * Formats a unit for an HL7 field
 *
 * @param unit - The unit string
 * @returns The formatted unit
 */
function formatHl7Unit(unit: string | undefined): string {
  return unit || '';
}

/**
 * Formats FHIR ReferenceRange into an HL7 field
 *
 * @param ranges - The FHIR ReferenceRange array
 * @returns The formatted reference range
 */
function formatReferenceRange(ranges: any[] | undefined): string {
  if (!ranges?.length || !ranges[0]) {
    return '';
  }

  const range = ranges[0];

  if (range.low && range.high) {
    return `${range.low.value}-${range.high.value}`;
  } else if (range.low) {
    return `>${range.low.value}`;
  } else if (range.high) {
    return `<${range.high.value}`;
  }

  return '';
}

/**
 * Formats FHIR Interpretation into an HL7 abnormal flags field
 *
 * @param interpretations - The FHIR Interpretation array
 * @returns The formatted abnormal flags
 */
function formatHl7Interpretation(interpretations: any[] | undefined): string {
  if (!interpretations?.length || !interpretations[0]?.coding?.[0]?.code) {
    return '';
  }

  return interpretations[0].coding[0].code;
}

/**
 * Determines the OBX value type based on the Observation
 *
 * @param observation - The Observation resource
 * @returns The HL7 OBX value type
 */
function determineObxValueType(observation: Observation): string {
  if (observation.valueQuantity) {
    return 'NM'; // Numeric
  } else if (observation.valueString) {
    return 'ST'; // String
  } else if (observation.valueCodeableConcept) {
    return 'CE'; // Coded Entry
  } else if (observation.valueDateTime) {
    return 'DT'; // Date/Time
  } else if (observation.dataAbsentReason) {
    return 'ST'; // String for null values with reason
  }

  return 'ST'; // Default to String
}

/**
 * Formats an Observation value based on its type
 *
 * @param observation - The Observation resource
 * @param valueType - The OBX value type
 * @returns The formatted observation value
 */
function formatObservationValue(observation: Observation, valueType: string): string {
  if (observation.dataAbsentReason) {
    return ''; // Empty value with abnormal flags
  }

  switch (valueType) {
    case 'NM':
      if (observation.valueQuantity?.comparator) {
        return `${observation.valueQuantity.comparator}${observation.valueQuantity.value}`;
      }
      return observation.valueQuantity?.value?.toString() || '';
    case 'ST':
      return observation.valueString || '';
    case 'CE':
      if (observation.valueCodeableConcept?.coding?.[0]) {
        const coding = observation.valueCodeableConcept.coding[0];
        return `${coding.code}^${coding.display}^${coding.system}`;
      }
      return '';
    case 'DT':
      if (observation.valueDateTime) {
        return formatHl7DateTime(new Date(observation.valueDateTime));
      }
      return '';
    default:
      return '';
  }
}

/**
 * Maps FHIR status to HL7 status code
 *
 * @param status - The FHIR status
 * @returns The HL7 status code
 */
function mapFhirStatusToHl7(status: string | undefined): string {
  switch (status) {
    case 'final':
      return 'F';
    case 'preliminary':
      return 'P';
    case 'corrected':
      return 'C';
    case 'cancelled':
      return 'X';
    case 'registered':
      return 'I';
    default:
      return 'P'; // Default to preliminary
  }
}

/**
 * Creates an OBX segment for a PDF attachment
 *
 * @param form - The Attachment containing the PDF data or URL
 * @param setId - The set ID for this observation
 * @returns An HL7 OBX segment for the PDF
 */
function createObxPdfSegment(form: Attachment, setId: number): Hl7Segment {
  let base64Content = '';

  if (form.data) {
    base64Content = form.data;
  } else {
    throw new Error('Parsed presentedForm attachments must have data');
  }

  return new Hl7Segment([
    'OBX', // OBX
    setId.toString(), // Set ID
    'ED', // Value Type (ED = Encapsulated Data)
    'PDF^PDFBASE64', // Observation Identifier (PDF^PDFBASE64)
    '1', // Observation Sub-ID
    `${base64Content}`, // Observation Value (<content>)
  ]);
}
