import {
  formatAddress,
  formatCodeableConcept,
  formatDate,
  formatMoney,
  formatQuantity,
  getDateProperty,
} from '@medplum/core';
import {
  Address,
  Claim,
  ClaimItem,
  Coverage,
  Device,
  HumanName,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  RelatedPerson,
} from '@medplum/fhirtypes';
import { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getAuthenticatedContext } from '../../../context';
import fs from 'fs';

/**
 * Creates a PDF document definition from a Claim resource.
 * @param claim - The Claim resource.
 * @returns The PDF document definition.
 */
export async function getClaimPDFDocDefinition(claim: Claim): Promise<TDocumentDefinitions> {
  // Fetch all referenced resources
  const { repo } = getAuthenticatedContext();

  const patient = await repo.readReference(claim.patient);
  const coverage = await repo.readReference(claim.insurance[0].coverage);
  const insured = coverage.subscriber ? await repo.readReference(coverage.subscriber) : undefined;
  const insurer = await repo.readReference(coverage.payor[0]);
  const provider = await repo.readReference(claim.provider);
  const otherCoverage = claim.insurance.length > 1 ? await repo.readReference(claim.insurance[1].coverage) : undefined;
  const otherInsured = otherCoverage?.subscriber ? await repo.readReference(otherCoverage.subscriber) : undefined;
  const referralRequest = claim.referral ? await repo.readReference(claim.referral) : undefined;
  const referrer = referralRequest?.requester ? await repo.readReference(referralRequest.requester) : undefined;

  // Extract information from resources
  const { personName: patientName, personGender: patientGender, personPhone: patientPhone } = getPersonInfo(patient);
  const patientDOB = getDateProperty(patient.birthDate);
  const { insuranceType, insuredIdNumber, relationship, coverageName, coveragePolicyName } = getCoverageInfo(coverage);
  const {
    personName: insuredName,
    personPhone: insuredPhone,
    personDob: insuredDob,
    personGender: insuredGender,
  } = getPersonInfo(insured);
  const insuredDOB = getDateProperty(insuredDob);

  const { coverageName: otherCoverageName, coveragePolicyName: otherCoveragePolicyName } =
    getCoverageInfo(otherCoverage);
  const { personName: otherInsuredName } = getPersonInfo(otherInsured);

  const { referrerName, referrerNpi } = getReferralInfo(referrer);

  // Create the document definition
  const docDefinition: TDocumentDefinitions = {
    content: [
      {
        image: 'data:image/png;base64,' + imageToBase64(__dirname + '/cms1500.png'),
        absolutePosition: { x: 0, y: 0 },
        width: 612,
        height: 792,
      },
      createPositionedText(patientName, 22, 131),
      createPositionedText(insuredIdNumber, 374, 108),
      createPositionedText(insuredName, 374, 131),
      createPositionedText(otherInsuredName, 22, 228),
      createPositionedText(coveragePolicyName, 375, 228),
      createPositionedText(otherCoveragePolicyName, 22, 251),
      createPositionedText(coverageName, 375, 298),
      createPositionedText(otherCoverageName, 22, 324),
      createPositionedText(referrerName, 42, 420),
      createPositionedText(referrerNpi, 247, 420),
      ...getInsuranceProgramContent(insuranceType),
      ...getDateContent(patientDOB),
      ...getSexContent(patientGender),
      ...getAddressContent(patient.address?.[0]),
      ...getPhoneContent(patientPhone),
      ...getPatientRelationshipToInsuredContent(relationship),
      ...getAddressContent(insured?.address?.[0], 374),
      ...getPhoneContent(insuredPhone, 482),
      ...getClaimContent(claim),
      ...getSexContent(insuredGender, 504, 51, 253),
      ...getDateContent(insuredDOB, 395, 253),
      ...getInsurerContent(insurer),
      ...getProviderContent(provider),
      ...getReservedNUCCContent(),
      ...getSignatureContent(),
    ],
  };

  return docDefinition;
}

function imageToBase64(imagePath: string): string {
  try {
    const fileData = fs.readFileSync(imagePath);
    const base64String = fileData.toString('base64');
    return base64String;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw new Error('Failed to convert image to base64: ' + (error as Error).message);
  }
}

/**
 * PDF content helper functions.
 * The following functions help create and format content for the PDF document.
 */

/**
 * Creates positioned text content for the PDF.
 * @param text - The text to create positioned text for
 * @param x - The x-coordinate of the text
 * @param y - The y-coordinate of the text
 * @param fontSize - The font size of the text
 * @returns The positioned text content
 */
export function createPositionedText(text: string, x: number, y: number, fontSize: number = 9): Content {
  return {
    text: text || '', // Ensure text is never undefined
    absolutePosition: { x, y },
    fontSize,
  };
}

/**
 * Gets claim content for the PDF.
 * @param claim - The claim resource to extract information from
 * @returns An array of positioned content elements for the PDF
 */
export function getClaimContent(claim: Claim): Content[] {
  const {
    relatedToEmployment,
    relatedToAutoAccident,
    accidentLocationState,
    relatedToOtherAccident,
    dateOfCurrentIllness,
    employmentImpactedStart,
    employmentImpactedEnd,
    hospitalizationStart,
    hospitalizationEnd,
    priorAuthRefNumber,
    outsideLab,
    outsideLabCharges,
    resubmissionCode,
    originalReference,
    patientAccountNumber,
    patientPaid,
    totalCharge,
    items,
    diagnosis,
  } = getClaimInfo(claim);

  const dateOfCurrentIllnessAsDate = dateOfCurrentIllness ? getDateProperty(dateOfCurrentIllness) : undefined;
  const employmentImpactedStartAsDate = employmentImpactedStart ? getDateProperty(employmentImpactedStart) : undefined;
  const employmentImpactedEndAsDate = employmentImpactedEnd ? getDateProperty(employmentImpactedEnd) : undefined;
  const hospitalizationStartAsDate = hospitalizationStart ? getDateProperty(hospitalizationStart) : undefined;
  const hospitalizationEndAsDate = hospitalizationEnd ? getDateProperty(hospitalizationEnd) : undefined;

  return [
    createPositionedText(relatedToEmployment ? 'X' : '', 267, 253),
    createPositionedText(!relatedToEmployment ? 'X' : '', 310, 253),
    createPositionedText(relatedToAutoAccident ? 'X' : '', 267, 277),
    createPositionedText(!relatedToAutoAccident ? 'X' : '', 310, 277),
    createPositionedText(accidentLocationState, 343, 277),
    createPositionedText(relatedToOtherAccident ? 'X' : '', 267, 300),
    createPositionedText(!relatedToOtherAccident ? 'X' : '', 310, 300),
    ...getDateContent(dateOfCurrentIllnessAsDate, 26, 396),
    // Date qualifier
    createPositionedText('', 130, 396),
    ...getDateContent(employmentImpactedStartAsDate, 402, 396),
    ...getDateContent(employmentImpactedEndAsDate, 503, 396),
    ...getDateContent(hospitalizationStartAsDate, 402, 420),
    ...getDateContent(hospitalizationEndAsDate, 503, 420),
    // Other date fields
    createPositionedText('', 234, 396),
    createPositionedText('', 279, 396),
    createPositionedText('', 300, 396),
    createPositionedText('', 322, 396),
    createPositionedText(priorAuthRefNumber, 374, 490),
    createPositionedText(outsideLab ? 'X' : '', 388, 444),
    createPositionedText(!outsideLab ? 'X' : '', 423, 444),
    createPositionedText(outsideLabCharges, 465, 444),
    createPositionedText(resubmissionCode, 374, 469),
    createPositionedText(originalReference, 456, 469),
    createPositionedText(patientAccountNumber, 178, 684),
    createPositionedText(totalCharge.replace('$', ''), 381, 684),
    createPositionedText(patientPaid.replace('USD', ''), 463, 684),
    ...getDiagnosisContent(diagnosis),
    ...getClaimItemContent(items),
    // Accept assignment
    createPositionedText('', 287, 684),
    createPositionedText('', 322, 684),
  ];
}

/**
 * Gets claim item content for the PDF.
 * @param items - The claim items to include in the PDF
 * @returns An array of positioned content elements for the PDF
 */
export function getClaimItemContent(items: ClaimItemInfo[]): Content[] {
  const content: Content[] = [];

  // Base coordinates for each row
  const rowBaseCoordinates = [
    { y: 540 }, // Row 1
    { y: 565 }, // Row 2
    { y: 588 }, // Row 3
    { y: 613 }, // Row 4
    { y: 637 }, // Row 5
    { y: 661 }, // Row 6
  ];

  items.forEach((item, index) => {
    // Only process up to 6 items
    if (index >= 6) {
      return;
    }

    const yPos = rowBaseCoordinates[index].y;
    const rowContent = [
      ...getDateContent(getDateProperty(item.dateOfService), 21, yPos),
      createPositionedText(item.placeOfServiceState, 149, yPos),
      createPositionedText(item.emergency ? 'X' : '', 172, yPos),
      createPositionedText(item.procedureCode, 194, yPos),
      createPositionedText(item.modifiers, 246, yPos),
      createPositionedText(item.diagnosisPointer, 335, yPos),
      createPositionedText(item.charges, 373, yPos),
      createPositionedText(item.daysOrUnits, 437, yPos),
      createPositionedText(item.familyPlanIndicator, 466, yPos),
    ];
    content.push(...rowContent);
  });

  return content;
}

/**
 * Gets insurance program content for the PDF.
 * @param insuranceType - The type of insurance program
 * @returns An array of positioned content elements for the PDF
 */
export function getInsuranceProgramContent(insuranceType: string): Content[] {
  const optionsMap: Record<string, number> = {
    MEDICARE: 23,
    MEDICAID: 71,
    TRICARE: 122,
    CHAMPVA: 187,
    'GROUP HEALTH PLAN': 237,
    'FECA BLK LUNG': 295,
    OTHER: 338,
  };

  return [createPositionedText('X', optionsMap[insuranceType] ?? 338, 108)];
}

/**
 * Gets date content for the PDF.
 * @param date - The date to format
 * @param xAxisOffset - The x-coordinate offset
 * @param yAxisOffset - The y-coordinate offset
 * @returns An array of positioned content elements for the PDF
 */
export function getDateContent(
  date: Date | undefined,
  xAxisOffset: number = 236,
  yAxisOffset: number = 131
): Content[] {
  if (!date) {
    return [];
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).substring(2);

  return [
    createPositionedText(day, xAxisOffset, yAxisOffset),
    createPositionedText(month, xAxisOffset + 21, yAxisOffset),
    createPositionedText(year, xAxisOffset + 42, yAxisOffset),
  ];
}

/**
 * Gets sex content for the PDF.
 * @param personGender - The gender of the person
 * @param xAxisOffset - The x-coordinate offset
 * @param xAxisDifference - The x-coordinate difference
 * @param yAxisOffset - The y-coordinate offset
 * @returns An array of positioned content elements for the PDF
 */
export function getSexContent(
  personGender: string,
  xAxisOffset: number = 316,
  xAxisDifference: number = 36,
  yAxisOffset: number = 131
): Content[] {
  const optionsMap: Record<string, number> = {
    male: xAxisOffset,
    female: xAxisOffset + xAxisDifference,
  };

  if (!personGender || !(personGender.toLocaleLowerCase() in optionsMap)) {
    return [];
  }

  return [createPositionedText('X', optionsMap[personGender.toLocaleLowerCase()], yAxisOffset)];
}

/**
 * Gets phone content for the PDF.
 * @param phone - The phone number to format
 * @param xAxisOffset - The x-coordinate offset
 * @param yAxisOffset - The y-coordinate offset
 * @returns An array of positioned content elements for the PDF
 */
export function getPhoneContent(phone: string, xAxisOffset: number = 123, yAxisOffset: number = 204): Content[] {
  if (!phone) {
    return [];
  }

  // Validate phone format
  const phoneRegex = /^(\(\d{3}\)|\d{3}-|\d{3})\s*\d{3}[-\s]?\d{4}$/;
  if (!phoneRegex.test(phone)) {
    return [];
  }

  // Extract digits only from the phone number
  const digits = phone.replace(/\D/g, '');
  const areaCode = digits.substring(0, 3);
  const middle = digits.substring(3, 6);
  const last = digits.substring(6);

  return [
    createPositionedText(areaCode, xAxisOffset, yAxisOffset),
    createPositionedText(`${middle}-${last}`, xAxisOffset + 27, yAxisOffset),
  ];
}

/**
 * Gets address content for the PDF.
 * @param address - The address to format
 * @param xAxisOffset - The x-coordinate offset
 * @returns An array of positioned content elements for the PDF
 */
export function getAddressContent(address: Address | undefined, xAxisOffset: number = 22): Content[] {
  if (!address) {
    return [];
  }

  const { line, city, postalCode, state } = address;

  return [
    createPositionedText(line?.[0] ?? '', xAxisOffset, 156),
    createPositionedText(city ?? '', xAxisOffset, 179),
    createPositionedText(state ?? '', xAxisOffset + 181, 179),
    createPositionedText(postalCode ?? '', xAxisOffset, 204),
  ];
}

/**
 * Gets patient relationship to insured content for the PDF.
 * @param relationship - The relationship to format
 * @returns An array of positioned content elements for the PDF
 */
export function getPatientRelationshipToInsuredContent(relationship: string): Content[] {
  // Map of relationship codes to x-coordinates
  const relationshipMap: Record<string, number> = {
    self: 252,
    spouse: 289,
    child: 317,
    other: 353,
  };

  if (!relationship) {
    return [createPositionedText('X', relationshipMap['other'], 156)];
  }

  const xCoord = relationshipMap[relationship.toLowerCase()] ?? relationshipMap['other'];
  return [createPositionedText('X', xCoord, 156)];
}

/**
 * Gets reserved NUCC content for the PDF.
 * @returns An array of positioned content elements for the PDF
 */
export function getReservedNUCCContent(): Content[] {
  return [
    createPositionedText('', 229, 179),
    createPositionedText('', 22, 275),
    createPositionedText('', 375, 277),
    createPositionedText('', 393, 277),
    createPositionedText('', 22, 298),
    createPositionedText('', 386, 324),
    createPositionedText('', 22, 324),
    createPositionedText('', 422, 324),
    createPositionedText('', 21, 440),
  ];
}

/**
 * Gets signature content for the PDF.
 * @returns An array of positioned content elements for the PDF
 */
export function getSignatureContent(): Content[] {
  return [
    createPositionedText('', 59, 370),
    createPositionedText('', 274, 370),
    createPositionedText('', 415, 370),
    createPositionedText('', 19, 726),
    createPositionedText('', 113, 738),
  ];
}

/**
 * Gets insurer content for the PDF.
 * @param insurer - The insurer resource to extract information from
 * @returns An array of positioned content elements for the PDF
 */
export function getInsurerContent(insurer: Organization | Patient | RelatedPerson): Content[] {
  const { serviceNPI, serviceName, serviceLocation, fedTaxNumber } = getInsurerInfo(insurer);

  return [
    createPositionedText(fedTaxNumber, 20, 684),
    // SSN (Social Security Number)
    createPositionedText('', 136, 683),
    // EIN (Employer Identification Number)
    createPositionedText('X', 152, 684),
    createPositionedText(serviceNPI, 187, 743),
    createPositionedText(serviceName, 177, 705),
    createPositionedText(serviceLocation, 177, 716),
  ];
}

/**
 * Gets provider content for the PDF.
 * @param provider - The provider resource to extract information from
 * @returns An array of positioned content elements for the PDF
 */
export function getProviderContent(provider: Practitioner | Organization | PractitionerRole): Content[] {
  const { billingName, billingLocation, billingPhoneNumber, providerNpi } = getProviderInfo(provider);

  return [
    ...getPhoneContent(billingPhoneNumber, 489, 698),
    createPositionedText(billingName, 372, 706),
    createPositionedText(billingLocation, 372, 716),
    createPositionedText(providerNpi, 380, 743),
  ];
}

/**
 * Gets diagnosis content for the PDF.
 * @param diagnosis - The diagnosis codes to format
 * @returns An array of positioned content elements for the PDF
 */
export function getDiagnosisContent(diagnosis: string[]): Content[] {
  // Up to 12 diagnosis codes
  const diagnosisPositions = [
    // Row 1
    { x: 35, y: 470, index: 0 },
    { x: 128, y: 470, index: 1 },
    { x: 222, y: 470, index: 2 },
    { x: 317, y: 470, index: 3 },
    // Row 2
    { x: 35, y: 482, index: 4 },
    { x: 128, y: 482, index: 5 },
    { x: 222, y: 482, index: 6 },
    { x: 317, y: 482, index: 7 },
    // Row 3
    { x: 35, y: 493, index: 8 },
    { x: 128, y: 493, index: 9 },
    { x: 222, y: 493, index: 10 },
    { x: 317, y: 493, index: 11 },
  ];

  return diagnosisPositions.map(({ x, y, index }) => createPositionedText(diagnosis?.[index] ?? '', x, y));
}

/* Data retrieval helpers */

/**
 * Gets person information.
 * @param person - The person resource to extract information from
 * @returns Record containing person details
 */
export function getPersonInfo(
  person: Patient | RelatedPerson | undefined
): Record<'personName' | 'personDob' | 'personGender' | 'personAddress' | 'personPhone', string> {
  if (!person) {
    return {
      personName: '',
      personDob: '',
      personGender: '',
      personAddress: '',
      personPhone: '',
    };
  }

  const personName = person.name?.[0] ? formatHumanName(person.name[0]) : '';
  const personDob = formatDate(person.birthDate);
  const personGender = person.gender ?? '';
  const personAddress = person.address ? formatAddress(person.address[0]) : '';
  const personPhone = person.telecom?.find((telecom) => telecom.system === 'phone')?.value ?? '';

  return {
    personName,
    personDob,
    personGender,
    personAddress,
    personPhone,
  };
}

/**
 * Gets coverage information.
 * @param coverage - The coverage resource to extract information from
 * @returns Record containing insurance details
 */
export function getCoverageInfo(
  coverage: Coverage | undefined
): Record<
  'insuranceType' | 'insuredIdNumber' | 'relationship' | 'coverageName' | 'coveragePolicy' | 'coveragePolicyName',
  string
> {
  if (!coverage) {
    return {
      insuranceType: '',
      insuredIdNumber: '',
      relationship: '',
      coverageName: '',
      coveragePolicy: '',
      coveragePolicyName: '',
    };
  }

  const insuranceType = coverage.type?.coding?.[0].display ?? coverage.type?.coding?.[0].code ?? '';
  const insuredIdNumber = coverage.identifier?.find((id) => id.use === 'official')?.value ?? '';
  const relationship = coverage.relationship?.coding?.[0].display ?? coverage.relationship?.coding?.[0].code ?? '';
  const coverageName = coverage.payor[0].display ?? '';
  const coveragePlan = coverage.class?.find(
    (classification) =>
      classification.type.coding?.[0].code === 'plan' || classification.type.coding?.[0].code === 'group'
  );
  const coveragePolicy = formatCodeableConcept(coveragePlan?.type);
  const coveragePolicyName = coveragePlan?.name ?? '';

  return {
    insuranceType,
    insuredIdNumber,
    relationship,
    coverageName,
    coveragePolicy,
    coveragePolicyName,
  };
}

/**
 * Gets claim information.
 * @param claim - The claim resource to extract information from
 * @returns Record containing claim details
 */
export function getClaimInfo(claim: Claim): {
  relatedToEmployment: boolean;
  relatedToAutoAccident: boolean;
  accidentLocation: string;
  accidentLocationState: string;
  relatedToOtherAccident: boolean;
  dateOfCurrentIllness: string;
  employmentImpactedStart: string;
  employmentImpactedEnd: string;
  hospitalizationStart: string;
  hospitalizationEnd: string;
  priorAuthRefNumber: string;
  outsideLab: boolean;
  outsideLabCharges: string;
  diagnosis: string[];
  resubmissionCode: string;
  originalReference: string;
  patientAccountNumber: string;
  patientPaid: string;
  totalCharge: string;
  items: ClaimItemInfo[];
} {
  const relatedToEmployment =
    claim.supportingInfo?.some((info) => info.category.coding?.[0].code === 'employmentimpacted') ?? false;
  const relatedToAutoAccident = claim.accident?.type?.coding?.some((code) => code.code === 'MVA') ?? false;
  const accidentLocation = claim.accident?.locationAddress ? formatAddress(claim.accident.locationAddress) : '';
  const accidentLocationState = claim.accident?.locationAddress?.state ?? '';
  const relatedToOtherAccident = !relatedToAutoAccident && !!claim.accident;

  const dateOfCurrentIllness = formatDate(
    claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'onset')?.timingDate
  );

  const employmentImpacted = claim.supportingInfo?.find(
    (info) => info.category.coding?.[0].code === 'employmentimpacted'
  );
  const employmentImpactedStart = employmentImpacted?.timingPeriod?.start ?? '';
  const employmentImpactedEnd = employmentImpacted?.timingPeriod?.end ?? '';

  const hospitalization = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'hospitalized');
  const hospitalizationStart = hospitalization?.timingPeriod?.start
    ? formatDate(hospitalization.timingPeriod.start)
    : '';
  const hospitalizationEnd = hospitalization?.timingPeriod?.end ? formatDate(hospitalization.timingPeriod.end) : '';

  const priorAuthRefNumber = claim.insurance[0]?.preAuthRef?.[0] ?? '';

  const outsideLab = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'outsidelab');
  const outsideLabCharges = outsideLab ? formatQuantity(outsideLab.valueQuantity) : '';

  const diagnosis = (claim.diagnosis || [])
    .map(
      (d) =>
        d.diagnosisCodeableConcept?.coding?.find((code) => code.system === 'http://hl7.org/fhir/sid/icd-10')?.code ?? ''
    )
    .filter((code) => code !== '');
  const resubmissionCode =
    claim.related?.[0].relationship?.coding?.find((code) => code.code === 'prior')?.display ?? '';
  const originalReference = claim.related?.[0].claim?.display ?? '';

  const patientAccountNumber =
    claim.supportingInfo?.find(
      (info) =>
        info.category?.coding?.find((code) => code.code === 'info') &&
        info.code?.coding?.find((code) => code.code === 'patientaccount')
    )?.valueString ?? '';
  const patientPaid = formatQuantity(
    claim.supportingInfo?.find(
      (info) =>
        info.category?.coding?.find((code) => code.code === 'info') &&
        info.code?.coding?.find((code) => code.code === 'patientpaid')
    )?.valueQuantity
  );
  const totalCharge = formatMoney(claim.total);

  // Handle multiple service items (up to 6)
  const claimItems = claim.item || [];
  const items = [];
  for (let i = 0; i < Math.min(6, claimItems.length); i++) {
    const item = claimItems[i];
    const itemInfo = getClaimItemInfo(item);
    items.push(itemInfo);
  }

  return {
    relatedToEmployment,
    relatedToAutoAccident,
    accidentLocation,
    accidentLocationState,
    relatedToOtherAccident,
    dateOfCurrentIllness,
    employmentImpactedStart,
    employmentImpactedEnd,
    hospitalizationStart,
    hospitalizationEnd,
    priorAuthRefNumber,
    outsideLab: !!outsideLab,
    outsideLabCharges,
    diagnosis,
    resubmissionCode,
    originalReference,
    patientAccountNumber,
    patientPaid,
    totalCharge,
    items,
  };
}

type ClaimItemInfo = ReturnType<typeof getClaimItemInfo>;

/**
 * Gets claim item information.
 * @param item - The claim item to extract information from
 * @returns Record containing claim item details
 */
export function getClaimItemInfo(item: ClaimItem): {
  dateOfService: string;
  placeOfService: string;
  placeOfServiceState: string;
  emergency: boolean;
  procedureCode: string;
  modifiers: string;
  diagnosisPointer: string;
  charges: string;
  daysOrUnits: string;
  familyPlanIndicator: string;
} {
  const dateOfService = formatDate(item.servicedDate);
  const placeOfService = item.locationAddress ? formatAddress(item.locationAddress) : '';
  const placeOfServiceState = item.locationAddress?.state ?? '';
  const emergency = item.category?.coding?.[0].code === 'EMG';
  const procedureCode = formatCodeableConcept(item.productOrService);
  const modifiers = formatCodeableConcept(item.modifier?.[0]);
  const diagnosisPointer = (item.diagnosisSequence || [])
    .map((num) => {
      // Convert numbers 1-12 to letters A-L
      if (num >= 1 && num <= 12) {
        return String.fromCharCode(64 + num); // 65 is ASCII for 'A'
      }
      return '';
    })
    .filter((letter) => letter)
    .join('');
  const charges = formatMoney(item.net);
  const daysOrUnits = formatQuantity(item.quantity);
  const familyPlanIndicator =
    item.programCode?.[0].coding?.[0].code === 'none' ? '' : formatCodeableConcept(item.programCode?.[0]);

  return {
    dateOfService,
    placeOfService,
    placeOfServiceState,
    emergency,
    procedureCode,
    modifiers,
    diagnosisPointer,
    charges,
    daysOrUnits,
    familyPlanIndicator,
  };
}

/**
 * Gets insurer information.
 * @param insurer - The insurer resource to extract information from
 * @returns Record containing insurer details
 */
export function getInsurerInfo(insurer: Organization | Patient | RelatedPerson): {
  serviceNPI: string;
  serviceName: string;
  serviceLocation: string;
  fedTaxNumber: string;
  fedTaxType: string;
} {
  if (insurer.resourceType === 'Patient' || insurer.resourceType === 'RelatedPerson') {
    return {
      serviceNPI: '',
      serviceName: '',
      serviceLocation: '',
      fedTaxNumber: '',
      fedTaxType: '',
    };
  }

  const serviceNPI = insurer.identifier?.find((id) => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value ?? '';
  const serviceName = insurer.name ?? '';
  const serviceLocation = insurer.address ? formatAddress(insurer.address[0]) : '';

  const taxIdentifier = insurer.identifier?.find((id) => id.type?.coding?.find((code) => code.code === 'TAX'));
  const fedTaxNumber = taxIdentifier?.value ?? '';
  const fedTaxType = taxIdentifier?.system ?? '';

  return {
    serviceNPI,
    serviceName,
    serviceLocation,
    fedTaxNumber,
    fedTaxType,
  };
}

/**
 * Gets provider information.
 * @param provider - The provider resource to extract information from
 * @returns Record containing provider details
 */
export function getProviderInfo(provider: Practitioner | Organization | PractitionerRole): {
  billingName: string;
  billingLocation: string;
  billingPhoneNumber: string;
  providerNpi: string;
} {
  if (provider.resourceType === 'PractitionerRole') {
    return {
      billingName: '',
      billingLocation: '',
      billingPhoneNumber: '',
      providerNpi: '',
    };
  }

  let billingName = '';
  if (provider.resourceType === 'Practitioner' && provider.name?.[0]) {
    billingName = formatHumanName(provider.name[0]);
  } else if (provider.resourceType === 'Organization' && provider.name) {
    billingName = provider.name;
  }
  const billingLocation = provider?.address?.[0] ? formatAddress(provider.address?.[0]) : '';
  const phoneNumber = provider.telecom?.find((comm) => comm.system === 'phone');
  const providerNpi = provider.identifier?.find((id) => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value ?? '';

  return {
    billingName,
    billingLocation,
    billingPhoneNumber: phoneNumber?.value ?? '',
    providerNpi,
  };
}

/**
 * Gets referral information.
 * @param referrer - The referrer resource to extract information from
 * @returns Record containing referral details
 */
export function getReferralInfo(
  referrer?: Practitioner | Organization | Device | Patient | RelatedPerson | PractitionerRole
): Record<string, string> {
  if (
    !referrer ||
    referrer.resourceType === 'Device' ||
    referrer.resourceType === 'Patient' ||
    referrer.resourceType === 'RelatedPerson' ||
    referrer.resourceType === 'PractitionerRole'
  ) {
    return {
      referrerName: '',
      referrerNpi: '',
    };
  }

  let referrerName = '';
  if (referrer.resourceType === 'Organization') {
    referrerName = referrer.name ?? '';
  } else {
    referrerName = referrer.name?.[0] ? formatHumanName(referrer.name[0]) : '';
  }
  const referrerNpi = referrer?.identifier?.find((id) => id.system === 'http://hl7.org/fhir/sid/us-npi')?.value ?? '';

  return {
    referrerName,
    referrerNpi,
  };
}

/**
 * Formats a human name.
 * @param name - The human name to format
 * @returns The formatted human name
 */
export function formatHumanName(name: HumanName): string {
  const family = name.family ?? '';
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
