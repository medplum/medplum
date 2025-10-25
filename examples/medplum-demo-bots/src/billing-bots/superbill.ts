// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, CreatePdfOptions, MedplumClient } from '@medplum/core';
import { formatAddress, formatDate, formatHumanName, getQuestionnaireAnswers, getReferenceString } from '@medplum/core';
import type {
  ChargeItemDefinition,
  Coding,
  DocumentReference,
  Encounter,
  Organization,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import type { TableCell } from 'pdfmake/interfaces';

type DocDefinition = CreatePdfOptions['docDefinition'];
type Content = DocDefinition['content'];

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<QuestionnaireResponse>
): Promise<DocumentReference> {
  const response = event.input;
  const answers = getQuestionnaireAnswers(response);

  const encounterRef = answers['encounters'].valueReference;
  if (!encounterRef) {
    throw new Error('No encounters specified');
  }

  const encounter = (await medplum.readReference(encounterRef)) as Encounter;
  const patient = await medplum.readReference(encounter.subject as Reference<Patient>);
  const coverage = await medplum.searchOne('Coverage', {
    beneficiary: getReferenceString(patient),
  });
  const insurer = coverage?.payor ? ((await medplum.readReference(coverage.payor[0])) as Organization) : undefined;
  const providerRef = encounter.participant?.find((participant) => {
    const participantCodes = participant.type;
    return participantCodes?.find((code) => code.coding?.find((type) => type.code === 'ATND'));
  })?.individual;

  const provider = providerRef ? ((await medplum.readReference(providerRef)) as Practitioner) : undefined;
  const serviceDate = formatDate(encounter.period?.end) ?? 'unknown';

  const codes: Coding[] = [];
  codes.push(encounter.class);
  if (encounter.serviceType?.coding) {
    codes.push(...encounter.serviceType.coding);
  }
  const chargeDefinitions = await getChargeDefinition(codes, medplum);

  const patientInfoSection = getPatientInfo(patient);
  const coverageInfoSection = getCoverageInfo(insurer);
  const providerInfoSection = getProviderInfo(provider);
  const feeTable = createFeeTable(chargeDefinitions, serviceDate);

  const pdfData: CreatePdfOptions = {
    docDefinition: {
      content: [...patientInfoSection, ...coverageInfoSection, ...providerInfoSection, ...feeTable],
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 13,
          color: 'black',
          alignment: 'center',
        },
        header: {
          bold: true,
          fontSize: 13,
        },
      },
    },
  };

  const binary = await medplum.createPdf(pdfData);
  const media: DocumentReference = await medplum.createResource({
    resourceType: 'DocumentReference',
    status: 'current',
    content: [
      {
        attachment: {
          contentType: 'application/pdf',
          url: 'Binary/' + binary.id,
          title: 'superbill.pdf',
        },
      },
    ],
  });

  return media;
}

function getProviderInfo(provider?: Practitioner): Content[] {
  const providerName = provider?.name ? formatHumanName(provider.name[0]) : '';
  const providerTitle = provider?.qualification?.[0].code.coding?.[0].display ?? '';
  return [
    { text: 'Provider Information', style: 'header' },
    {
      table: {
        body: [
          ['Physician Name:', providerName],
          ['Title:', providerTitle],
          ['Date:', formatDate(new Date().toISOString())],
        ],
      },
      layout: 'noBorders',
      margin: [0, 10],
    },
  ];
}

function getCoverageInfo(insurer?: Organization): Content[] {
  const insurerName = insurer?.name ?? '';

  return [
    { text: 'Insurance Information', style: 'header' },
    {
      table: {
        body: [
          ['Insurer:', insurerName],
          ['Policy Number:', '4290824'],
        ],
      },
      layout: 'noBorders',
      margin: [0, 10],
    },
  ];
}

function getPatientInfo(patient: Patient): Content[] {
  const name = patient.name?.[0] ? formatHumanName(patient.name[0]) : '';
  const dob = formatDate(patient.birthDate);
  const age = getAge(dob);
  const email = getEmailAddress(patient) ?? '';
  const phoneNumber = getPhoneNumber(patient) ?? '';
  const address = patient.address ? formatAddress(patient.address[0]) : '';
  const genderDisplay = patient.gender ? patient.gender?.charAt(0).toUpperCase() + patient.gender?.slice(1) : '';

  return [
    { text: 'Patient Information', style: 'header' },
    {
      table: {
        body: [
          ['Name:', name],
          ['Age:', age],
          ['Gender:', genderDisplay],
          ['Date of Birth:', dob],
          ['Phone Number:', phoneNumber],
          ['Email Address:', email],
          ['Home Address:', address],
        ],
      },
      layout: 'noBorders',
      margin: [0, 10],
    },
  ];
}

function createFeeTable(chargeDefinitions: ChargeItemDefinition[], serviceDate: string): Content[] {
  const body: TableCell[][] = [];
  let totalFee = 0;
  for (const chargeDefinition of chargeDefinitions) {
    const serviceDisplay = getServiceDisplayString(chargeDefinition);
    const dateCell = { text: serviceDate, noWrap: true };
    const fee = getServiceFee(chargeDefinition);
    totalFee += fee;
    const feeCell = { text: '$' + fee.toString(), noWrap: true, alignment: 'right' };
    const serviceCell = serviceDisplay;
    const bodyRow = [dateCell, serviceCell, feeCell];
    body.push(bodyRow);
  }

  body.push([
    { text: 'Total', colSpan: 2, style: 'tableHeader' },
    '',
    { text: '$' + totalFee, style: 'tableHeader', alignment: 'right' },
  ]);
  return [
    {
      table: {
        body: [
          [
            { text: 'Service Date', style: 'tableHeader' },
            { text: 'Service Provided', style: 'tableHeader' },
            { text: 'Fee', style: 'tableHeader' },
          ],
          ...body,
        ],
      },
      margin: [0, 10],
    },
  ];
}

function getPhoneNumber(patient: Patient): string | undefined {
  const phoneNumber = patient.telecom?.filter((method) => method.system === 'phone' && method.use === 'mobile');
  return phoneNumber?.[0].value;
}

function getEmailAddress(patient: Patient): string | undefined {
  const emails = patient.telecom?.filter((method) => method.system === 'email');
  const emailAddresses = emails?.map((email) => email.value);
  if (!emailAddresses) {
    return undefined;
  }
  return emailAddresses[0] as string;
}

function getAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

export function getServiceDisplayString(definition: ChargeItemDefinition): string {
  const code = definition.code?.coding?.[0].display;
  if (!code) {
    throw new Error('Invalid code on charge item definition');
  }

  return code;
}

export function getServiceFee(definition: ChargeItemDefinition): number {
  const fee = definition.propertyGroup?.[0].priceComponent?.[0].amount?.value;
  if (!fee) {
    throw new Error('No fee specified for this service');
  }

  return fee;
}

async function getChargeDefinition(codes: Coding[], medplum: MedplumClient): Promise<ChargeItemDefinition[]> {
  const chargeDefinitions: ChargeItemDefinition[] = [];
  for (const code of codes) {
    const searchableCode = code.code;
    if (searchableCode) {
      const result = await medplum.searchOne('ChargeItemDefinition', {
        'context-type': searchableCode,
      });

      if (result) {
        chargeDefinitions.push(result);
      }
    }
  }

  return chargeDefinitions;
}
