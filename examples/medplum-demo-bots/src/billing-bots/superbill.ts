import {
  BotEvent,
  CreatePdfOptions,
  formatDate,
  formatHumanName,
  getQuestionnaireAnswers,
  getReferenceString,
  MedplumClient,
} from '@medplum/core';
import {
  ChargeItemDefinition,
  Coding,
  Coverage,
  Encounter,
  Media,
  Patient,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>) {
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

  const codes: Coding[] = [];
  codes.push(encounter.class);
  if (encounter.serviceType?.coding) {
    codes.push(...encounter.serviceType?.coding);
  }

  getPatientInfo(patient);
  await getCoverageInfo(medplum, coverage);

  const chargeDefinitions = await getChargeDefinition(codes, medplum);
  const pdfData = formatPdfData(chargeDefinitions, encounter);
  const binary = await medplum.createPdf(pdfData);
  const media: Media = await medplum.createResource({
    resourceType: 'Media',
    status: 'completed',
    content: {
      contentType: 'application/pdf',
      url: 'Binary/' + binary.id,
      title: 'superbill.pdf',
    },
  });

  return media;
}

async function getCoverageInfo(medplum: MedplumClient, coverage?: Coverage) {
  if (!coverage) {
    return;
  }
  const insurer = await medplum.readReference(coverage.payor[0]);
}

function getPatientInfo(patient: Patient) {
  const name = patient.name?.[0] ? formatHumanName(patient.name[0]) : '';
  const dob = formatDate(patient.birthDate);
  const age = getAge(dob);
  const email = getEmailAddress(patient);
  const phoneNumber = getPhoneNumber(patient);
}

function getPhoneNumber(patient: Patient): string | undefined {
  const phoneNumber = patient.telecom?.filter((method) => method.system === 'phone' && method.use === 'mobile');
  return phoneNumber?.[0].value;
}

function getEmailAddress(patient: Patient): string | (string | undefined)[] | undefined {
  const emails = patient.telecom?.filter((method) => method.system === 'email');
  const emailAddresses = emails?.map((email) => email.value);
  if (!emailAddresses) {
    return undefined;
  }
  if (emailAddresses.length === 1) {
    return emailAddresses[0];
  }

  return emailAddresses;
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

export function formatPdfData(chargeDefinitions: ChargeItemDefinition[], encounter: Encounter): CreatePdfOptions {
  const serviceDate = formatDate(encounter.period?.end);
  const pdfData: CreatePdfOptions = {
    docDefinition: {
      content: [
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto'],
            body: [
              [
                { text: 'Service Date', style: 'tableHeader' },
                { text: 'Service Provided', style: 'tableHeader' },
                { text: 'Fee ($)', style: 'tableHeader' },
              ],
            ],
          },
        },
      ],
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 13,
          color: 'black',
          alignment: 'center',
        },
      },
    },
  };
  for (const chargeDefinition of chargeDefinitions) {
    const serviceDisplay = getServiceDisplayString(chargeDefinition);
    const dateCell = { text: serviceDate, noWrap: true };
    const fee = getServiceFee(chargeDefinition);
    const feeCell = { text: fee, noWrap: true };
    const serviceCell = serviceDisplay;
    const bodyRow = [dateCell, serviceCell, feeCell];
    pdfData.docDefinition.content[0].table.body.push(bodyRow);
  }

  return pdfData;
}

function getServiceDisplayString(definition: ChargeItemDefinition): string {
  const code = definition.code?.coding?.[0].display;
  if (!code) {
    throw new Error('Invalid code on charge item definition');
  }

  return code;
}

function getServiceFee(definition: ChargeItemDefinition): string {
  const fee = definition.propertyGroup?.[0].priceComponent?.[0].amount?.value;
  if (!fee) {
    throw new Error('No fee specified for this service');
  }

  return fee.toString();
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
