import {
  BotEvent,
  formatAddress,
  formatCodeableConcept,
  formatMoney,
  formatQuantity,
  getDisplayString,
  MedplumClient,
} from '@medplum/core';
import { Address, Claim, HumanName, Media, Practitioner, RelatedPerson } from '@medplum/fhirtypes';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { CSM_1500_PDF_BASE_64_BG } from './cms-1500-image';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const insuranceTypes = new Set<string>([
  'MEDICARE',
  'MEDICAID',
  'TRICARE',
  'CHAMPVA',
  'GROUP HEALTH PLAN',
  'FECA BLK LUNG',
  'OTHER',
]);

export async function handler(medplum: MedplumClient, _event: BotEvent<Claim>): Promise<Media> {
  const docDefinition = await getCms1500DocumentDefinition(medplum, _event.input);

  const binary = await medplum.createPdf({
    docDefinition,
  });

  const media = await medplum.createResource({
    resourceType: 'Media',
    status: 'completed',
    content: {
      contentType: 'application/pdf',
      url: 'Binary/' + binary.id,
      title: 'cms-1500.pdf',
    },
  });

  return media;
}

export async function getCms1500DocumentDefinition(
  medplum: MedplumClient,
  claim: Claim
): Promise<TDocumentDefinitions> {
  const patient = await medplum.readReference(claim.patient);
  const coverage = await medplum.readReference(claim.insurance[0].coverage);
  const insured = coverage.subscriber ? await medplum.readReference(coverage.subscriber) : undefined;
  const insurer = await medplum.readReference(coverage.payor[0]);
  const provider = await medplum.readReference(claim.provider);
  const otherCoverage =
    claim.insurance.length > 1 ? await medplum.readReference(claim.insurance[1].coverage) : undefined;
  const otherInsured = otherCoverage?.subscriber ? await medplum.readReference(otherCoverage.subscriber) : undefined;
  const referralRequest = claim.referral ? await medplum.readReference(claim.referral) : undefined;
  const referrer = referralRequest?.requester ? await medplum.readReference(referralRequest.requester) : undefined;

  const insuranceType = coverage.type?.coding?.[0].code ?? coverage.type?.coding?.[0].display ?? '';

  const relationship = (insured as RelatedPerson | undefined)?.relationship?.[0]?.coding?.[0].code ?? 'self';

  const relatedToEmployment =
    claim.supportingInfo?.some((info) => info.category.coding?.[0].code === 'employmentimpacted') ?? false;
  const relatedToAutoAccident = claim.accident?.type?.coding?.some((code) => code.code === 'MVA') ?? false;

  const accidentLocationState = claim.accident?.locationAddress?.state;
  const relatedToOtherAccident = !relatedToAutoAccident && !!claim.accident;

  const dateOfCurrentIllness = claim.supportingInfo?.find(
    (info) => info.category.coding?.[0].code === 'onset'
  )?.timingDate;

  const employmentImpacted = claim.supportingInfo?.find(
    (info) => info.category.coding?.[0].code === 'employmentimpacted'
  );

  const hospitalization = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'hospitalized');

  const priorAuthRefNumber = claim.insurance[0]?.preAuthRef?.[0];

  const outsideLab = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'outsidelab');
  const outsideLabCharges = outsideLab ? formatQuantity(outsideLab.valueQuantity) : '';

  const diagnosis = (claim.diagnosis ?? [])
    .map(
      (d) => d.diagnosisCodeableConcept?.coding?.find((code) => code.system === 'http://hl7.org/fhir/sid/icd-10')?.code
    )
    .filter(Boolean) as string[];

  const resubmissionCode = claim.related?.[0].relationship?.coding?.find((code) => code.code === 'prior')?.display;

  const originalReference = claim.related?.[0].claim?.display;

  const patientAccountNumber = claim.supportingInfo?.find(
    (info) =>
      info.category?.coding?.find((code) => code.code === 'info') &&
      info.code?.coding?.find((code) => code.code === 'patientaccount')
  )?.valueString;

  const patientPaid = formatQuantity(
    claim.supportingInfo?.find(
      (info) =>
        info.category?.coding?.find((code) => code.code === 'info') &&
        info.code?.coding?.find((code) => code.code === 'patientpaid')
    )?.valueQuantity
  );

  const taxIdentifier = insurer.identifier?.find((id) => id.type?.coding?.find((code) => code.code === 'TAX'));

  const docDefinition: TDocumentDefinitions = {
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 8,
    },
    pageSize: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    pageMargins: 0,
    content: [
      // Optional background image
      // When printing on official CMS-1500 paper, this image is not needed.
      {
        image: CSM_1500_PDF_BASE_64_BG,
        absolutePosition: { x: 0, y: 0 },
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      },

      // 1. Insurance Type
      createCheckmark(insuranceType === 'MEDICARE', 23, 111),
      createCheckmark(insuranceType === 'MEDICAID', 71, 111),
      createCheckmark(insuranceType === 'TRICARE', 122, 111),
      createCheckmark(insuranceType === 'CHAMPVA', 187, 111),
      createCheckmark(insuranceType === 'GROUP HEALTH PLAN', 237, 111),
      createCheckmark(insuranceType === 'FECA BLK LUNG', 295, 111),
      createCheckmark(insuranceType === 'OTHER' || !insuranceTypes.has(insuranceType), 338, 111),

      // 1a. Insured's ID Number
      createText(coverage.identifier?.find((id) => id.use === 'official')?.value, 374, 111),

      // 2. Patient's Name
      createText(formatHumanName(patient.name?.[0]), 22, 135),

      // 3. Patient's Birth Date (MM/DD/YYYY)
      createDate(patient.birthDate, 236, 135),

      // Patient's sex
      createCheckmark(patient.gender === 'male', 316, 135),
      createCheckmark(patient.gender === 'female', 352, 135),

      // 4. Insured's Name
      createText(formatHumanName(insured?.name?.[0]), 374, 135),

      // 5. Patient's Address
      createText(patient.address?.[0]?.line?.join(', '), 22, 159),
      createText(patient.address?.[0]?.city, 22, 182),
      createText(patient.address?.[0]?.state, 203, 182),
      createText(patient.address?.[0]?.postalCode, 22, 207),
      createText(getPhoneAreaCode(patient.telecom?.find((cp) => cp.system === 'phone')?.value), 126, 207),
      createText(getRemainingPhone(patient.telecom?.find((cp) => cp.system === 'phone')?.value), 153, 207),

      // 6. Patient's Relationship to Insured
      createCheckmark(relationship === 'self', 252, 159),
      createCheckmark(relationship === 'spouse', 289, 159),
      createCheckmark(relationship === 'child', 317, 159),
      createCheckmark(relationship === 'other', 353, 159),

      // 7. Insured's Address
      createText(insured?.address?.[0]?.line?.join(', '), 374, 159),
      createText(insured?.address?.[0]?.city, 374, 182),
      createText(insured?.address?.[0]?.state, 555, 182),
      createText(insured?.address?.[0]?.postalCode, 374, 207),
      createText(getPhoneAreaCode(insured?.telecom?.find((cp) => cp.system === 'phone')?.value), 483, 207),
      createText(getRemainingPhone(insured?.telecom?.find((cp) => cp.system === 'phone')?.value), 511, 207),

      // 9. Other Insured's Name
      createText(formatHumanName(otherInsured?.name?.[0]), 22, 231),

      // 9a. Other Insured's ID Number
      createText(otherCoverage?.identifier?.find((id) => id.use === 'official')?.value, 22, 254),

      // 9d. Insurance plan name or program name
      createText(getDisplayString(insurer), 22, 327),

      // 10a. Employment?
      createCheckmark(relatedToEmployment, 267, 255),
      createCheckmark(!relatedToEmployment, 310, 255),

      // 10b. Auto accident?
      createCheckmark(relatedToAutoAccident, 267, 279),
      createCheckmark(!relatedToAutoAccident, 310, 279),
      createText(accidentLocationState, 341, 279),

      // 10c. Other accident?
      createCheckmark(relatedToOtherAccident, 267, 302),
      createCheckmark(!relatedToOtherAccident, 310, 302),

      // 11. Insured's policy group or FECA number
      createText(coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'group')?.value, 375, 228),

      // 11a. Insured's date of birth (MM/DD/YYYY)
      createDate(insured?.birthDate, 396, 255),

      // Insured's sex
      createCheckmark(insured?.gender === 'male', 504, 255),
      createCheckmark(insured?.gender === 'female', 555, 255),

      // 11b. Other claim ID (designated by NUCC)

      // 11c. Insurance plan name or program name
      createText(coverage.class?.find((c) => c.type?.coding?.[0]?.code === 'plan')?.name, 375, 301),

      // 12. Patient's or authorized person's signature

      // 14. Date of current illness, injury, or pregnancy (LMP)
      createDate(dateOfCurrentIllness, 28, 399),

      // 16. Dates patient unable to work in current occupation
      createDate(employmentImpacted?.timingPeriod?.start, 404, 399),
      createDate(employmentImpacted?.timingPeriod?.end, 505, 399),

      // 17. Name of referring provider or other source
      createText(referrer ? getDisplayString(referrer) : '', 43, 423),

      // 17b. NPI number
      createText(referrer?.identifier?.find((id) => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value, 247, 423),

      // 18. Hospitalization dates related to current services
      createDate(hospitalization?.timingPeriod?.start, 404, 423),
      createDate(hospitalization?.timingPeriod?.end, 505, 423),

      // 19. Additional claim information (designated by NUCC)

      // 20. Outside lab
      createCheckmark(!!outsideLab, 389, 446),
      createCheckmark(!outsideLab, 424, 446),
      createText(outsideLabCharges, 465, 446),

      // 21. Diagnosis or Nature of Illness or Injury
      diagnosis.map((diagnosisCode, index) => {
        const x = 37 + (index % 4) * 94;
        const y = 471 + Math.floor(index / 4) * 12;
        return createText(diagnosisCode, x, y);
      }),

      // 22. Resubmission code
      createText(resubmissionCode, 374, 471),

      // Original ref number
      createText(originalReference, 456, 471),

      // 23. Prior authorization number
      createText(priorAuthRefNumber, 374, 493),

      // 24. Claim lines
      claim.item?.map((item, index) => {
        const y = 542 + index * 25;
        return [
          // 24A. Dates of service
          createDate(item?.servicedDate, 21, y),

          // 24B. Place of service
          createText(item?.locationAddress?.state, 149, y),

          // 24C. EMG
          createCheckmark(item.category?.coding?.[0].code === 'EMG', 172, y),

          // 24D. Procedures, services, or supplies
          createText(formatCodeableConcept(item.productOrService), 194, y),
          createText(formatCodeableConcept(item.modifier?.[0]), 246, y),

          // 24E. Diagnosis pointer
          createText('', 335, y),

          // 24F. Charges
          createText(formatMoney(item.net), 373, y),

          // 24G. Days or units
          createText(formatQuantity(item.quantity), 437, y),

          // 24H. EPSDT family plan
          createText(formatCodeableConcept(item.programCode?.[0]), 466, y),
        ].flat();
      }),

      // 25. Federal tax ID number
      createText(taxIdentifier?.value, 22, 686),

      // 26. Patient's account number
      createText(patientAccountNumber, 180, 686),

      // 28. Total charge
      createText(formatMoney(claim.total).replace('$', ''), 383, 686),

      // 29. Amount paid
      createText(patientPaid.replace('USD', ''), 463, 686),

      // 32. Service facility location information
      createText('', 179, 707),
      createText('', 177, 719),

      // 32a. Service facility NPI number
      createText('', 187, 745),

      // 33. Billing provider info & phone number
      createText(getPhoneAreaCode(provider?.telecom?.find((cp) => cp.system === 'phone')?.value), 491, 699),
      createText(getRemainingPhone(provider?.telecom?.find((cp) => cp.system === 'phone')?.value), 518, 699),
      createText(getDisplayString(provider), 375, 709),
      createText(
        (provider as Practitioner).address?.[0]
          ? formatAddress((provider as Practitioner).address?.[0] as Address)
          : '',
        375,
        721
      ),

      // 33a. Billing provider NPI number
      createText(provider?.identifier?.find((i) => i.system === 'http://hl7.org/fhir/sid/us-npi')?.value, 380, 745),
    ]
      .flat()
      .filter(Boolean) as Content[],
  };
  return docDefinition;
}

function createText(text: string | undefined, x: number, y: number): Content | undefined {
  if (!text) {
    return undefined;
  }
  return {
    text,
    absolutePosition: { x, y },
  };
}

function createCheckmark(checked: boolean, x: number, y: number): Content | undefined {
  return createText(checked ? 'X' : '', x, y);
}

function createDate(date: string | undefined, x: number, y: number): (Content | undefined)[] | undefined {
  return [
    createText(date?.substring(5, 7), x, y),
    createText(date?.substring(8, 10), x + 21, y),
    createText(date?.substring(0, 4), x + 42, y),
  ];
}

function getSimplePhone(phone: string | undefined): string | undefined {
  if (!phone) {
    return undefined;
  }

  let result = phone;

  if (result.startsWith('tel:')) {
    result = result.substring(4);
  }

  if (result.startsWith('+1')) {
    result = result.substring(2);
  }

  if (result.startsWith('1')) {
    result = result.substring(1);
  }

  // Remove all remaining non-digit characters
  return result.replace(/\D/g, '');
}

function getPhoneAreaCode(phone: string | undefined): string | undefined {
  return getSimplePhone(phone)?.substring(0, 3);
}

function getRemainingPhone(phone: string | undefined): string | undefined {
  const simple = getSimplePhone(phone);
  if (!simple) {
    return undefined;
  }
  return simple.substring(3, 6) + '-' + simple.substring(6);
}

export function formatHumanName(name: HumanName | undefined): string {
  if (!name) {
    return '';
  }

  const family = name.family;
  const given = name.given ?? [];

  if (!family && given.length === 0) {
    return '';
  }

  const [firstName, ...rest] = given;
  const middleName = rest.join(' ');

  const parts = [];

  if (family) {
    parts.push(family);
  }
  if (firstName) {
    parts.push(firstName);
  }
  if (middleName) {
    parts.push(middleName);
  }

  return parts.join(', ');
}
