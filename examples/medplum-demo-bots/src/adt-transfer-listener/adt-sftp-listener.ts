// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, streamToBuffer, normalizeErrorString, createReference } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import { default as SftpClient } from 'ssh2-sftp-client';
import type { ReadStream } from 'ssh2';
import type { MessageHeader, Patient, Encounter, AllergyIntolerance, Practitioner } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Hl7Message>): Promise<any> {
  // Read SFTP connection data from project secrets
  const host = event.secrets['SFTP_HOST']?.valueString;
  const user = event.secrets['SFTP_USER']?.valueString;
  const key = event.secrets['SFTP_PRIVATE_KEY']?.valueString;

  if (!host || !user || !key) {
    throw new Error('Missing required secrets: SFTP_HOST, SFTP_USER, SFTP_PRIVATE_KEY');
  }

  const sftp = new SftpClient();
  try {
    console.log('Connecting to SFTP...');
    await sftp.connect({
      host: host,
      username: user,
      privateKey: key,
      retries: 5,
      retry_factor: 2,
      retry_minTimeout: 2000,
    });

    // read .adt files from sftp
    const fileContents = await readSFTPDirectory(sftp, 'adt');

    const messages = fileContents.map(Hl7Message.parse);

    for (const message of messages) {
      try {
        await processAdtMessage(medplum, message);
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

async function readSFTPDirectory(sftp: SftpClient, dir: string, batchSize = 25): Promise<string[]> {
  const results: string[] = [];

  // List all *.adt files in directory
  const fileList = await sftp.list(dir, (fileInfo) => fileInfo.name.endsWith('adt'));

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

export async function processAdtMessage(medplum: MedplumClient, message: Hl7Message): Promise<void> {
  console.log('Processing ADT message', message.toString());

  // Parse the HL7 MSH segment
  const messageType = message.header.getComponent(9, 1);
  if (messageType !== 'ADT') {
    throw new Error('Invalid message type: ' + messageType);
  }

  const messageSubtype = message.header.getComponent(9, 2);
  if (messageSubtype !== 'A01' && messageSubtype !== 'A08') {
    throw new Error('Invalid message subtype: ' + messageSubtype);
  }

  // Parse the HL7 PID segment to read the patient id
  const patientId = message.getSegment('PID')?.getComponent(3, 1);
  if (!patientId || patientId.length === 0) {
    throw new Error('Missing patient ID in PID segment');
  }

  // Parse the HL7 PV1 segment to read the encounter information
  const encounterId = message.getSegment('PV1')?.getComponent(19, 1);
  if (!encounterId || encounterId.length === 0) {
    throw new Error('Missing encounter ID in PV1 segment');
  }

  try {
    // Create MessageHeader
    const messageHeader = createMessageHeader(message);
    if (messageHeader) {
      await medplum.createResource(messageHeader);
      console.log('Created MessageHeader');
    }

    // Create or update Patient
    const patient = createPatient(message);
    let upsertedPatient: Patient | undefined;
    if (patient) {
      upsertedPatient = await medplum.upsertResource(patient, {
        identifier: `${patient.identifier?.[0]?.system}|${patient.identifier?.[0]?.value}`,
      });
      console.log('Upserted Patient');
    }

    // Create or update Practitioner
    const practitioner = createPractitioner(message);
    let upsertedPractitioner: Practitioner | undefined;
    if (practitioner) {
      upsertedPractitioner = await medplum.upsertResource(practitioner, {
        identifier: `${practitioner.identifier?.[0]?.system}|${practitioner.identifier?.[0]?.value}`,
      });
      console.log('Upserted Practitioner');
    }

    // Create or update Encounter
    const encounter = createEncounter(message, upsertedPatient, upsertedPractitioner);
    if (encounter) {
      await medplum.upsertResource(encounter, {
        identifier: `${encounter.identifier?.[0]?.system}|${encounter.identifier?.[0]?.value}`,
      });
      console.log('Upserted Encounter');
    }

    // Create or update AllergyIntolerance resources
    const allergies = createAllergyIntolerances(message, upsertedPatient);
    for (const allergy of allergies) {
      if (!upsertedPatient) {
        console.error('Missing patient for allergy creation');
        continue;
      }

      await medplum.upsertResource(allergy, {
        patient: createReference(upsertedPatient).reference,
        code: `${allergy.code?.coding?.[0]?.system}|${allergy.code?.coding?.[0]?.code}`,
      });
      console.log('Upserted AllergyIntolerance');
    }

    console.log('Successfully processed ADT message');
  } catch (err: any) {
    console.error('Error processing ADT message:', normalizeErrorString(err));
    throw err;
  }
}

function createMessageHeader(message: Hl7Message): MessageHeader | null {
  const msh = message.header;
  if (!msh) {
    console.error('Missing MSH segment in message');
    return null;
  }

  try {
    const messageHeader: MessageHeader = {
      resourceType: 'MessageHeader',
      eventCoding: {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0003',
        code: msh.getField(9)?.getComponent(2) || 'A01',
        display: getMessageTypeDisplay(msh.getField(9)?.getComponent(2) || 'A01'),
      },
      source: {
        name: msh.getField(3)?.getComponent(1) || 'Unknown',
        endpoint: msh.getField(4)?.getComponent(1) || 'Unknown',
      },
      focus: [],
    };

    return messageHeader;
  } catch (err: any) {
    console.error('Error creating MessageHeader:', normalizeErrorString(err));
    return null;
  }
}

function createPatient(message: Hl7Message): Patient | null {
  const pid = message.getSegment('PID');

  if (!pid) {
    console.error('Missing PID segment in message');
    return null;
  }

  try {
    const patient: Patient = {
      resourceType: 'Patient',
      identifier: [],
      name: [],
      telecom: [],
      address: [],
      contact: [],
    };

    // Patient identifiers from PID-3
    const mrn = pid.getField(3);
    if (mrn) {
      patient.identifier?.push({
        system: 'http://hospital.smarthealthit.org',
        value: mrn.getComponent(1) || '',
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'MR',
              display: 'Medical record number',
            },
          ],
        },
      });
    }

    // Patient name from PID-5
    const nameField = pid.getField(5);
    if (nameField) {
      const familyName = nameField.getComponent(1) || '';
      const givenName1 = nameField.getComponent(2) || '';
      const givenName2 = nameField.getComponent(3) || '';
      const suffix = nameField.getComponent(4) || '';
      const prefix = nameField.getComponent(5) || '';

      const givenNames = [givenName1, givenName2].filter((name) => name.trim() !== '');
      const prefixes = [prefix].filter((prefix) => prefix.trim() !== '');
      const suffixes = [suffix].filter((suffix) => suffix.trim() !== '');

      patient.name?.push({
        family: familyName,
        given: givenNames.length > 0 ? givenNames : undefined,
        prefix: prefixes.length > 0 ? prefixes : undefined,
        suffix: suffixes.length > 0 ? suffixes : undefined,
        use: 'official',
      });
    }

    // Birth date from PID-7
    const birthDate = parseHL7Date(pid.getField(7)?.getComponent(1));
    if (birthDate) {
      patient.birthDate = birthDate;
    }

    // Gender from PID-8
    const gender = pid.getField(8)?.getComponent(1);
    if (gender) {
      patient.gender = mapGender(gender);
    }

    // Address from PID-11
    const addressField = pid.getField(11);
    if (addressField) {
      patient.address?.push({
        line: [addressField.getComponent(1) || '', addressField.getComponent(2) || ''].filter(Boolean),
        city: addressField.getComponent(3) || '',
        state: addressField.getComponent(4) || '',
        postalCode: addressField.getComponent(5) || '',
        country: addressField.getComponent(6) || '',
        use: 'home',
      });
    }

    // Phone from PID-13
    const phone = pid.getField(13)?.getComponent(1);
    if (phone) {
      patient.telecom?.push({
        system: 'phone',
        value: phone,
        use: 'home',
      });
    }

    return patient;
  } catch (err: any) {
    console.error('Error creating Patient:', normalizeErrorString(err));
    return null;
  }
}

function createPractitioner(message: Hl7Message): Practitioner | null {
  const pv1 = message.getSegment('PV1');

  if (!pv1) {
    console.error('Missing PV1 segment in message');
    return null;
  }

  try {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      identifier: [],
      name: [],
    };

    const attendingDoctor = pv1.getField(7);
    if (attendingDoctor) {
      const practitionerId = attendingDoctor.getComponent(1);
      if (practitionerId) {
        practitioner.identifier?.push({
          system: 'http://hospital.smarthealthit.org/practitioner',
          value: practitionerId,
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'MD',
                display: 'Medical License number',
              },
            ],
          },
        });
      }

      // Extract name components
      const familyName = attendingDoctor.getComponent(2) || '';
      const givenName1 = attendingDoctor.getComponent(3) || '';
      const givenName2 = attendingDoctor.getComponent(4) || '';
      const suffix = attendingDoctor.getComponent(5) || '';
      const prefix = attendingDoctor.getComponent(6) || '';

      const givenNames = [givenName1, givenName2].filter((name) => name.trim() !== '');
      const prefixes = [prefix].filter((prefix) => prefix.trim() !== '');
      const suffixes = [suffix].filter((suffix) => suffix.trim() !== '');

      if (familyName || givenNames.length > 0) {
        practitioner.name?.push({
          family: familyName,
          given: givenNames.length > 0 ? givenNames : undefined,
          prefix: prefixes.length > 0 ? prefixes : undefined,
          suffix: suffixes.length > 0 ? suffixes : undefined,
          use: 'official',
        });
      }

      // Extract title from component 7 (Dr)
      const title = attendingDoctor.getComponent(7);
      if (title && practitioner.name && practitioner.name.length > 0) {
        practitioner.name[0].prefix = practitioner.name[0].prefix || [];
        practitioner.name[0].prefix.push(title);
      }
    }

    // If no practitioner data was found, return null
    if (!practitioner.identifier || practitioner.identifier.length === 0) {
      return null;
    }

    return practitioner;
  } catch (err: any) {
    console.error('Error creating Practitioner:', normalizeErrorString(err));
    return null;
  }
}

function createEncounter(
  message: Hl7Message,
  patient: Patient | undefined,
  practitioner: Practitioner | undefined
): Encounter | null {
  const pv1 = message.getSegment('PV1');

  if (!pv1) {
    console.error('Missing PV1 segment in message');
    return null;
  }

  if (!patient) {
    console.error('Missing patient for encounter creation');
    return null;
  }

  try {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      status: (() => {
        // Get the status from PV1 field 41 -  This may vary by source system so we need to handle it dynamically
        const statusValue = pv1.getField(41)?.getComponent(1)?.toLowerCase();
        // Allowed Encounter.status values in FHIR
        const allowedStatuses = [
          'planned',
          'arrived',
          'triaged',
          'in-progress',
          'onleave',
          'finished',
          'cancelled',
          'entered-in-error',
          'unknown',
        ];
        if (statusValue && allowedStatuses.includes(statusValue)) {
          return statusValue as Encounter['status'];
        }
        // Default value if not present or not in value set
        return 'unknown';
      })(),
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: mapPatientClass(pv1.getField(2)?.getComponent(1)) || 'IMP',
        display: 'inpatient encounter',
      },
      subject: createReference(patient),
    };

    // Add practitioner if available
    if (practitioner) {
      encounter.participant = [
        {
          individual: createReference(practitioner),
        },
      ];
    }

    // Visit number from PV1-19
    const visitNumber = pv1.getField(19)?.getComponent(1);
    if (visitNumber) {
      encounter.identifier = [
        {
          system: 'http://hospital.smarthealthit.org/visit',
          value: visitNumber,
        },
      ];
    }

    // Location from PV1-3
    const location = pv1.getField(3);
    if (location) {
      encounter.location = [
        {
          location: {
            display:
              `${location.getComponent(1) || ''} ${location.getComponent(2) || ''} ${location.getComponent(3) || ''}`.trim(),
          },
        },
      ];
    }

    // Admission date from PV1-44
    const admissionDate = parseHL7DateTime(pv1.getField(44)?.getComponent(1));
    if (admissionDate) {
      encounter.period = {
        start: admissionDate,
      };
    }

    return encounter;
  } catch (err: any) {
    console.error('Error creating Encounter:', normalizeErrorString(err));
    return null;
  }
}

function createAllergyIntolerances(message: Hl7Message, patient: Patient | undefined): AllergyIntolerance[] {
  const allergies: AllergyIntolerance[] = [];

  if (!patient) {
    console.error('Missing patient for allergy creation');
    return allergies;
  }

  try {
    // Get all AL1 segments
    const al1Segments = message.getAllSegments('AL1');
    if (al1Segments.length === 0) {
      return allergies;
    }

    for (const al1 of al1Segments) {
      const allergy: AllergyIntolerance = {
        resourceType: 'AllergyIntolerance',
        patient: createReference(patient),
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
      };

      // Allergy type from AL1-3.1 only
      const allergyTypeFromAl13 = al1.getField(3)?.getComponent(1);

      if (allergyTypeFromAl13) {
        // Map from AL1.3.1 code
        const categoryFromCode = mapAllergyCategoryFromCode(allergyTypeFromAl13);
        if (categoryFromCode) {
          allergy.category = [categoryFromCode];
        }
        allergy.type = mapAllergyTypeFromCode(allergyTypeFromAl13);
      }

      // Allergen from AL1-3
      const allergenField = al1.getField(3);
      if (allergenField) {
        allergy.code = {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: allergenField.getComponent(1) || '',
              display: allergenField.getComponent(2) || '',
            },
          ],
        };
      }

      // Severity from AL1-4
      const severity = al1.getField(4)?.getComponent(1);
      if (severity) {
        allergy.criticality = mapAllergySeverity(severity);
      }

      // Reaction from AL1-5
      const reaction = al1.getField(5)?.getComponent(1);
      if (reaction) {
        allergy.reaction = [
          {
            manifestation: [
              {
                text: reaction,
              },
            ],
          },
        ];
      }

      // Date from AL1-6
      const onsetDate = parseHL7Date(al1.getField(6)?.getComponent(1));
      if (onsetDate) {
        allergy.onsetDateTime = onsetDate;
      }

      allergies.push(allergy);
    }

    return allergies;
  } catch (err: any) {
    console.error('Error creating AllergyIntolerances:', normalizeErrorString(err));
    return allergies;
  }
}

// Helper functions
function parseHL7Date(dateStr: string | undefined): string | undefined {
  if (!dateStr) {
    return undefined;
  }

  // Handle YYYYMMDD format
  if (dateStr.length >= 8) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

function parseHL7DateTime(dateStr: string | undefined): string | undefined {
  if (!dateStr) {
    return undefined;
  }

  // Handle YYYYMMDDHHMMSS format
  if (dateStr.length >= 14) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(8, 10);
    const minute = dateStr.substring(10, 12);
    const second = dateStr.substring(12, 14);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  } else if (dateStr.length >= 8) {
    return parseHL7Date(dateStr);
  }

  return undefined;
}

function mapGender(hl7Gender: string): 'male' | 'female' | 'other' | 'unknown' {
  switch (hl7Gender?.toUpperCase()) {
    case 'M':
      return 'male';
    case 'F':
      return 'female';
    case 'O':
      return 'other';
    default:
      return 'unknown';
  }
}

function mapPatientClass(hl7Class: string | undefined): string {
  switch (hl7Class) {
    case 'I':
      return 'IMP'; // Inpatient
    case 'O':
      return 'AMB'; // Outpatient
    case 'E':
      return 'EMER'; // Emergency
    default:
      return 'IMP';
  }
}

function mapAllergyCategoryFromCode(
  allergenCode: string
): 'food' | 'medication' | 'environment' | 'biologic' | undefined {
  // Map SNOMED codes to allergy categories (only codes present in test samples)
  switch (allergenCode) {
    // Food allergies
    case '414285001': // Food allergy (disorder)
    case '418471000': // Propensity to adverse reactions to food (disorder)
      return 'food';

    // Too general to map
    case '419199007': // Allergy to substance (disorder)
      return undefined;

    default:
      return undefined;
  }
}

function mapAllergyTypeFromCode(allergenCode: string): 'allergy' | 'intolerance' | undefined {
  switch (allergenCode) {
    case '414285001': // Food allergy (disorder)
    case '418471000': // Propensity to adverse reactions to food (disorder)
    case '419199007': // Allergy to substance (disorder)
      return 'allergy';

    default:
      return undefined;
  }
}

function mapAllergySeverity(severity: string): 'low' | 'high' | 'unable-to-assess' {
  switch (severity?.toUpperCase()) {
    case 'MI':
      return 'low';
    case 'MO':
      return 'low';
    case 'SV':
      return 'high';
    default:
      return 'unable-to-assess';
  }
}

function getMessageTypeDisplay(messageType: string): string {
  switch (messageType) {
    case 'A01':
      return 'Admit/visit notification';
    case 'A08':
      return 'Update patient information';
    default:
      return messageType;
  }
}
