// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { BotEvent, MedplumClient } from '@medplum/core';
import { Address, Claim, Coverage, Encounter, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { CandidApi, CandidApiClient } from 'candidhealth';
import { Gender, State } from 'candidhealth/api';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log('Candid Health Claim Connector Bot started');

  const candidClientId = event.secrets['CANDID_CLIENT_ID']?.valueString || '';
  const candidSecret = event.secrets['CANDID_SECRET_ID']?.valueString || '';
  const candidBaseUrl = event.secrets['CANDID_BASE_URL']?.valueString || '';

  if (!candidClientId || !candidSecret) {
    throw new Error('Missing required Candid Health credentials in bot secrets');
  }

  // Get the claim from the bot event
  const claim = event.input as Claim;
  if (!claim || claim.resourceType !== 'Claim') {
    throw new Error('Bot input must be a FHIR Claim resource');
  }

  console.log(`Processing claim: ${claim.id}`);

  try {
    // Initialize Candid client
    const candidClient = new CandidApiClient({
      baseUrl: candidBaseUrl, // Use production URL for live environment
      clientId: candidClientId,
      clientSecret: candidSecret,
    });

    // Process the claim
    const candidClaimId = await processClaim(medplum, candidClient, claim);

    // Update the Medplum claim with Candid reference
    // await updateClaimWithCandidReference(medplum, claim, candidClaimId);

    console.log(`Successfully connected claim ${claim.id} to Candid claim ${candidClaimId}`);

    return {
      success: true,
      medplumClaimId: claim.id,
      candidClaimId: candidClaimId,
      message: 'Claim successfully connected to Candid Health',
    };
  } catch (error: any) {
    console.error('Error processing claim:', error);

    // Update claim status to indicate error
    await updateClaimStatus(medplum, claim, 'error', `Candid integration error: ${error.message}`);

    throw error;
  }
}
async function processClaim(medplum: MedplumClient, candidClient: CandidApiClient, claim: Claim): Promise<string> {
  console.log('Starting claim processing with Candid API structure...');

  // Gather required resources
  console.log('Retrieved resources:');
  const patient = await getPatient(medplum, claim);
  console.log('- Patient:', patient?.id);
  const provider = await getProvider(medplum, claim);
  console.log('- Provider:', provider?.id, '(NPI:', getProviderNPI(provider), ')');
  const coverage = await getCoverage(medplum, claim);
  console.log('- Coverage:', coverage?.id);
  const encounter = await getEncounter(medplum, claim);
  console.log('- Encounter:', encounter?.id);

  // Step 1: Create Encounter in Candid
  const encounterData = await buildCandidEncounterRequest(claim, patient, provider, coverage, encounter);
  const encounterResponse = await candidClient.encounters.v4.create(encounterData);

  // Check if response has the encounter properties (successful response)
  if (encounterResponse.ok) {
    return encounterResponse.rawResponse.statusText;
  } else {
    // This is a FailedResponse<Error>
    throw new Error(`Failed to create encounter: ${JSON.stringify(encounterResponse)}`);
  }
}

// async function processClaim(
//   medplum: MedplumClient,
//   candidClient: CandidApiClient,
//   claim: Claim
// ): Promise<CandidApi.encounters.v4.Encounter | CandidApi.encounters.v4.create.Error> {
//   console.log('Starting claim processing with Candid API structure...');

//   // Gather required resources
//   const patient = await getPatient(medplum, claim);
//   const provider = getProvider(medplum, claim);
//   const coverage = await getCoverage(medplum, claim);
//   const encounter = await getEncounter(medplum, claim);

//   console.log('Retrieved resources:');
//   console.log('- Patient:', patient?.id);
//   console.log('- Provider:', provider?.id, '(NPI:', getProviderNPI(provider), ')');
//   console.log('- Coverage:', coverage?.id);
//   console.log('- Encounter:', encounter?.id);

//   // Step 1: Create Encounter in Candid
//   const encounterData = await buildCandidEncounterRequest(claim, patient, provider, coverage);
//   const encounterResponse = await candidClient.encounters.v4.create(encounterData);

//   return encounterResponse;

// if (encounterResponse.success) {
//   return encounterResponse.data;
// } else {
//   throw new Error(`Failed to create encounter: ${encounterResponse.error}`);
// }

// // Step 2: Create Service Lines for the encounter
// const serviceLineIds = [];
// if (claim.item && claim.item.length > 0) {
//   for (const item of claim.item) {
//     const serviceLineData = buildCandidServiceLineRequest(
//       encounterResponse.encounter_id,
//       item,
//       claim,
//       patient,
//       provider
//     );
//     const serviceLineResponse = await candidClient.createServiceLine(serviceLineData);
//     serviceLineIds.push(serviceLineResponse.service_line_id);
//   }
// }

// console.log(`Created encounter ${encounterResponse.encounter_id} with ${serviceLineIds.length} service lines`);

// // Submit to Candid
// const candidResponse = await candidClient.claims.v1.post(candidClaimRequest);

// console.log('Candid claim created:', candidResponse.claimId);
// return candidResponse.claimId;

async function getProvider(medplum: MedplumClient, claim: Claim): Promise<Practitioner> {
  const providerReference = claim.provider?.reference || claim.careTeam?.find((ct) => ct.provider)?.provider?.reference;
  if (!providerReference) {
    throw new Error('Claim missing provider reference');
  }
  const provider = await medplum.readReference<Practitioner>({ reference: providerReference });
  if (!provider) {
    throw new Error(`Provider not found: ${providerReference}`);
  }
  return provider;
}

function getProviderNPI(provider: Practitioner): string {
  return provider.identifier?.find((id) => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value || '';
}

// function buildCandidServiceLineRequest(encounterId, item, claim, patient, provider) {
//   console.log('Building service line for CPT:', item.productOrService?.coding?.[0]?.code);

//   return {
//     encounter_id: encounterId,

//     // Service details
//     procedure_code: item.productOrService?.coding?.[0]?.code,
//     procedure_code_type: 'CPT',

//     // Modifiers
//     modifiers: item.modifier?.map((m) => m.coding?.[0]?.code) || [],

//     // Financial
//     charge_amount_cents: Math.round((item.unitPrice?.value || 0) * 100),
//     units: item.quantity?.value || 1,

//     // Date
//     date_of_service: item.servicedDate || claim.created?.split('T')[0],

//     // Diagnosis pointers
//     diagnosis_pointers: item.diagnosisSequence || [1],

//     // Place of service
//     place_of_service_code: item.locationCodeableConcept?.coding?.[0]?.code || '11',

//     // External reference
//     external_id: `${claim.id}-item-${item.sequence}`,
//   };
// }

async function buildCandidEncounterRequest(
  claim: Claim,
  patient: Patient,
  provider: Practitioner,
  coverage: Coverage,
  encounter: Encounter
): Promise<CandidApi.encounters.v4.EncounterCreate> {
  console.log('Building Candid encounter request...');

  // Extract patient demographics
  const patientName = patient.name?.[0];
  const patientAddress = patient.address?.[0];
  //const patientPhone = patient.telecom?.find((t) => t.system === 'phone')?.value;

  // Extract provider info
  const providerNPI = getProviderNPI(provider);
  if (!providerNPI) {
    throw new Error(`Provider missing NPI: ${provider.id}`);
  }

  // Build diagnoses array
  const diagnoses =
    claim.diagnosis?.map((diag) => ({
      code: diag.diagnosisCodeableConcept?.coding?.[0]?.code || '',
      codeType: CandidApi.DiagnosisTypeCode.Dr,
      name: diag.diagnosisCodeableConcept?.coding?.[0]?.display || '',
    })) || [];

  // Build Candid encounter request according to their API
  const encounterRequest: CandidApi.encounters.v4.EncounterCreate = {
    // Required fields
    externalId: encounter.id || (`encounter-${Date.now()}` as any),
    patientAuthorizedRelease: true,
    benefitsAssignedToProvider: true,
    providerAcceptsAssignment: true,

    // Date of service
    dateOfService: (claim.created?.split('T')[0] || new Date().toISOString().split('T')[0]) as string,

    // Patient information
    patient: {
      externalId: patient.id || '',
      firstName: patientName?.given?.[0] || '',
      lastName: patientName?.family || '',
      dateOfBirth: patient.birthDate || '',
      gender: mapGender(patient.gender),
      address: mapAddress(patientAddress),
    },
    // Provider information
    renderingProvider: {
      npi: providerNPI,
      firstName: provider.name?.[0]?.given?.[0] || '',
      lastName: provider.name?.[0]?.family || '',
      taxonomyCode: provider.qualification?.[0]?.code?.coding?.[0]?.code || '',
    },

    // Billing provider (often same as rendering)
    billingProvider: {
      npi: providerNPI,
      firstName: provider.name?.[0]?.given?.[0] || '',
      lastName: provider.name?.[0]?.family || '',
      taxonomyCode: provider.qualification?.[0]?.code?.coding?.[0]?.code || '',
      address: {
        address1: patientAddress?.line?.[0] || '',
        address2: patientAddress?.line?.[1] || '',
        city: patientAddress?.city || '',
        state: (patientAddress?.state as State) || '',
        zipCode: patientAddress?.postalCode || '',
        zipPlusFourCode: '0000', // Required for StreetAddressLongZip
      },
      taxId: '12-3456789', // Required field - would need to be provided
    },

    // Place of service
    placeOfServiceCode: '11', // Office

    // Diagnoses
    diagnoses: diagnoses,

    // Insurance information
    ...(coverage
      ? {
          subscriberPrimary: {
            firstName: patientName?.given?.[0] || '',
            lastName: patientName?.family || '',
            dateOfBirth: patient.birthDate || '',
            gender: mapGender(patient.gender),
            insuranceCard: {
              groupNumber: coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'group')?.value || 'DEFAULT_GROUP',
              memberId: coverage.subscriberId || '',
              payerName: '1199SEIU Family of Funds', // Would need to be looked up
              payerId: '13162',
            },
            patientRelationshipToSubscriberCode: '18', // Self
          },
          payerUuid: 'payer-uuid-from-lookup', // Would need to look this up from Candid's payer database
          responsibleParty: 'INSURANCE_PAY',
        }
      : {
          responsibleParty: 'SELF_PAY',
        }),

    // Additional fields
    billableStatus: 'BILLABLE',
    appointmentType: 'Office Visit',
    serviceFacility: {
      npi: providerNPI,
      organizationName: provider.name?.[0]?.text || 'Provider Organization',
      address: {
        address1: patientAddress?.line?.[0] || '',
        address2: patientAddress?.line?.[1] || '',
        city: patientAddress?.city || '',
        state: (patientAddress?.state as State) || '',
        zipCode: patientAddress?.postalCode || '',
        zipPlusFourCode: '0000',
      },
    },
  };

  return encounterRequest;
}

async function getPatient(medplum: MedplumClient, claim: Claim): Promise<Patient> {
  if (!claim.patient?.reference) {
    throw new Error('Claim missing patient reference');
  }

  const patient = await medplum.readReference(claim.patient as Reference<Patient>);
  if (!patient) {
    throw new Error(`Patient not found: ${claim.patient.reference}`);
  }

  return patient;
}

async function getCoverage(medplum: MedplumClient, claim: Claim): Promise<Coverage> {
  if (!claim.insurance?.[0]?.coverage?.reference) {
    console.log('No coverage reference found in claim');
    throw Error('No coverage found in claim object');
  }

  try {
    return await medplum.readReference(claim.insurance[0].coverage as Reference<Coverage>);
  } catch (error) {
    console.log('Could not retrieve coverage:', error);
    throw Error('No coverage found at reference ');
  }
}

async function getEncounter(medplum: MedplumClient, claim: Claim): Promise<Encounter> {
  if (!claim.item?.[0]?.encounter?.[0]?.reference) {
    throw Error('no reference');
  }

  try {
    return await medplum.readReference(claim.item[0].encounter[0] as Reference<Encounter>);
  } catch (error) {
    console.log('Could not retrieve encounter:', error);
    throw Error('Could not retrieve encounter:');
  }
}

// async function buildCandidClaimRequest(
//   claim: Claim,
//   patient: Patient,
//   provider: Practitioner,
//   coverage: Coverage | null,
//   encounter: Encounter | null
// ): Promise<any> {
//   // Extract patient demographics
//   const patientName = patient.name?.[0];
//   const patientAddress = patient.address?.[0];
//   const patientPhone = patient.telecom?.find((t) => t.system === 'phone')?.value;

//   // Extract provider NPI
//   const providerNPI = provider.identifier?.find((id) => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value;

//   if (!providerNPI) {
//     throw new Error(`Provider missing NPI: ${provider.id}`);
//   }

//   // Extract payer information from coverage
//   const payerId = coverage?.payor?.[0]?.identifier?.value || 'unknown_payer';

//   // Build service lines from claim items
//   const serviceLines =
//     claim.item?.map((item, index) => ({
//       serviceLineNumber: index + 1,
//       procedureCode: item.productOrService?.coding?.[0]?.code,
//       modifiers: item.modifier?.map((m) => m.coding?.[0]?.code).filter(Boolean),
//       chargeAmountCents: Math.round((item.unitPrice?.value || 0) * 100),
//       units: item.quantity?.value || 1,
//       diagnosisPointers: item.diagnosisSequence || [1],
//       placeOfServiceCode: encounter?.location?.[0]?.location?.identifier?.value || '11', // Default to office
//       serviceDate: item.servicedDate || claim.created,
//     })) || [];

//   // Build diagnosis codes
//   const diagnosisCodes =
//     claim.diagnosis?.map((diag) => ({
//       diagnosisCode: diag.diagnosisCodeableConcept?.coding?.[0]?.code,
//       diagnosisCodeType: 'ICD10',
//     })) || [];

//   // Build Candid claim request
//   const candidRequest = {
//     // Patient information
//     patient: {
//       firstName: patientName?.given?.[0] || '',
//       lastName: patientName?.family || '',
//       dateOfBirth: patient.birthDate,
//       gender: mapGender(patient.gender),
//       address: patientAddress
//         ? {
//             address1: patientAddress.line?.[0] || '',
//             address2: patientAddress.line?.[1] || undefined,
//             city: patientAddress.city || '',
//             state: patientAddress.state || '',
//             zipCode: patientAddress.postalCode || '',
//           }
//         : undefined,
//       phoneNumber: patientPhone,
//     },

//     // Provider information
//     billingProvider: {
//       npi: providerNPI,
//       taxonomyCode: provider.qualification?.[0]?.code?.coding?.[0]?.code,
//       firstName: provider.name?.[0]?.given?.[0],
//       lastName: provider.name?.[0]?.family,
//       organizationName: provider.name?.[0]?.text,
//     },

//     // Payer information
//     payerId: payerId,

//     // Claim information
//     claimFrequencyCode: '1', // Original claim
//     serviceDate: claim.created || new Date().toISOString().split('T')[0],

//     // Service lines
//     serviceLines: serviceLines,

//     // Diagnosis codes
//     diagnosisCodes: diagnosisCodes,

//     // Additional claim identifiers
//     externalId: claim.id,
//     priorAuthorizationNumber: claim.preAuthRef?.[0]?.value,

//     // Subscriber information (if different from patient)
//     subscriber: coverage
//       ? {
//           firstName: patientName?.given?.[0] || '',
//           lastName: patientName?.family || '',
//           memberId: coverage.subscriberId,
//           groupNumber: coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'group')?.value,
//         }
//       : undefined,
//   };

//   return candidRequest;
// }

function mapAddress(patientAddress: Address | undefined): CandidApi.StreetAddressShortZip {
  if (!patientAddress?.state) {
    throw Error('State required');
  }
  const state: State = patientAddress.state as State;

  const address: CandidApi.StreetAddressShortZip = {
    address1: patientAddress.line?.[0] || '',
    address2: patientAddress.line?.[1] || '',
    city: patientAddress.city || '',
    state: state || '',
    zipCode: patientAddress.postalCode || '',
  };
  return address;
}
function mapGender(fhirGender: string | undefined): Gender {
  switch (fhirGender) {
    case 'male':
      return Gender.Male;
    case 'female':
      return Gender.Female;
    case 'other':
      return Gender.Other;
    case 'unknown':
      return Gender.Unknown;
    default:
      return Gender.Unknown;
  }
}

// async function updateClaimWithCandidReference(
//   medplum: MedplumClient,
//   claim: Claim,
//   candidClaimId: string
// ): Promise<void> {
//   // Add Candid claim ID as an identifier
//   const updatedClaim: Claim = {
//     ...claim,
//     identifier: [
//       ...(claim.identifier || []),
//       {
//         system: 'https://candidhealth.com/claim-id',
//         value: candidClaimId,
//         use: 'secondary',
//       },
//     ],
//     status: 'active', // Update status to active
//     extension: [
//       ...(claim.extension || []),
//       {
//         url: 'https://candidhealth.com/integration-status',
//         valueString: 'connected',
//         valueDateTime: new Date().toISOString(),
//       },
//     ],
//   };

//   await medplum.updateResource(updatedClaim);
// }

async function updateClaimStatus(medplum: MedplumClient, claim: Claim, status: string, _note?: string): Promise<void> {
  const updatedClaim: Claim = {
    ...claim,
    status: status as any,
    extension: [
      ...(claim.extension || []),
      {
        url: 'https://candidhealth.com/integration-status',
        valueString: status,
        valueDateTime: new Date().toISOString(),
      },
    ],
  };

  // Note: Claim resource doesn't have a 'note' property in FHIR R4
  // If notes are needed, they should be stored in the 'text' property or as extensions

  await medplum.updateResource(updatedClaim);
}

// CommonJS export for Medplum bots
