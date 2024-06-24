import {
  BotEvent,
  formatAddress,
  formatCodeableConcept,
  formatDate,
  formatHumanName,
  formatMoney,
  formatQuantity,
  getReferenceString,
  MedplumClient,
} from '@medplum/core';
import {
  Claim,
  Coverage,
  Device,
  DocumentReference,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  RelatedPerson,
} from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Claim>): Promise<DocumentReference> {
  const claim = event.input;
  const coverage = await medplum.readReference(claim.insurance[0].coverage);
  const patient = await medplum.readReference(claim.patient);
  const provider = await medplum.readReference(claim.provider);
  const insurer = await medplum.readReference(coverage.payor[0]);
  const insured = coverage.subscriber ? await medplum.readReference(coverage.subscriber) : undefined;
  const otherCoverage =
    claim.insurance.length > 1 ? await medplum.readReference(claim.insurance[1].coverage) : undefined;
  const otherInsured = otherCoverage?.subscriber ? await medplum.readReference(otherCoverage.subscriber) : undefined;
  const referralRequest = claim.referral ? await medplum.readReference(claim.referral) : undefined;
  const referrer = referralRequest?.requester ? await medplum.readReference(referralRequest.requester) : undefined;

  const { patientName, patientDob, patientSex, patientAddress } = getPatientInfo(patient);
  const { insuranceType, insuredIdNumber, relation, coverageName } = getCoverageInfo(coverage);
  const { insuredName, insuredAddress, insuredDob, insuredSex } = getInsuredInfo(insured);
  const {
    employmentRelated,
    autoAccident,
    accidentLocation,
    otherAccident,
    dateOfService,
    placeOfService,
    emergency,
    procedureCode,
    modifiers,
    diagnosisPointer,
    charges,
    daysOrUnits,
    familyPlanIndicator,
    employmentImpactedStart,
    employmentimpactedEnd,
    patientAccountNumber,
    patientPaid,
    totalCharge,
    dateOfCurrentIllness,
    otherClaim,
    hospitalizationStart,
    hospitalizationEnd,
    diagnosis,
    resubmissionCode,
    originalReference,
    priorAuthRefNumber,
    outsideLab,
    outsideLabCharges,
  } = getClaimInfo(claim);
  const { otherPolicy, otherPolicyName, otherInsuredName } = getOtherInfo(otherCoverage, otherInsured);
  const { referrerName, referrerNpi } = getReferralInfo(referrer);
  const { serviceNpi, serviceLocation, fedTaxNumber, fedTaxType } = getInsurerInfo(insurer);
  const { billingLocation, billingPhoneNumber, providerNpi } = getProviderInfo(provider);

  const cms1500Lines = [
    'Field Number,Field Name,Description,',
    '1,Insurance Program Name,Indicates type of health insurance coverage applicable to the claim,' + insuranceType,
    "1a,Insured's ID Number,Identification number of the insured person," + insuredIdNumber,
    "2,Patient's Name,Full name of the patient," + patientName,
    "3,Patient's Birth Date,Date of birth of patient," + patientDob,
    "3,Patient's Sex,Gender of the patient," + patientSex,
    "4,Insured's Name,Full name of the insured person," + insuredName,
    "5,Patient's Address,Address of the patient," + patientAddress,
    '6,Patient Relationship to Insured,Relationship of the patient to the insured,' + relation,
    "7,Insured's Address,Address of the insured person," + insuredAddress,
    '8,Reserved for NUCC Use,Reserved for NUCC use',
    "9,Other Insured's Name,Full name of other insured if applicable," + otherInsuredName,
    "9a,Other Insured's Policy or Group Number,Policy or group number of other insured," + otherPolicy,
    '9b,Reserved for NUCC Use,Reserved for NUCC use',
    '9c,Reserved for NUCC Use,Reserved for NUCC use',
    '9d,Insurance Plan Name or Program Name,Insurance plan name or program name of other insured,' + otherPolicyName,
    "10a,Is Patient's Condition Related to Employment?,Indicates if patient's condition is related to employment," +
      employmentRelated,
    "10b,Is Patient's Condition Related to Auto Accident?,Indicates if patient's condition is related to auto accident," +
      autoAccident,
    '10b,Accident Location,Location of the related auto accident,' + accidentLocation,
    "10c,Is Patient's Condition Related to Other Accident?,Indicates if patient's condition is related to other accident," +
      otherAccident,
    "11,Insured's Policy Group or FECA Number,Policy group or FECA number of insured,",
    "11a,Insured's Date of Birth,Date of birth of insured," + insuredDob,
    "11b,Insured's Sex,Gender of insured," + insuredSex,
    '11b,Other Claim ID,Other claim ID,' + otherClaim,
    '11c,Insurance Plan Name or Program Name,Insurance plan name or program name,' + coverageName,
    '11d,Is There Another Health Benefit Plan?,Indicates if there is another health benefit plan,',
    "12,Patient's or Authorized Person's Signature,Signature of patient or authorized person,",
    "13,Insured's or Authorized Person's Signature,Signautre of insured or authorized person,",
    '14,Date of Current Illness/Injury/Pregnancy,Date of current illness/injury/pregnancy,' + dateOfCurrentIllness,
    '15,Other Date,Other date,',
    '16,Dates Patient Unable to Work in Current Occupation,Dates patient unable to work in current occupation,' +
      `${employmentImpactedStart} - ${employmentimpactedEnd}`,
    '17,Name of Referring Provider or Other Source,Full name of referring provider or other source,' + referrerName,
    '17a,Referring Provider Identifier,Identifier of the referring provider,',
    '17b,Referring Provider NPI,NPI of the referring provider,' + referrerNpi,
    '18,Hospitalization Dates Related to Current Services,Dates of hospitalization related to current services,' +
      `${hospitalizationStart} - ${hospitalizationEnd}`,
    '19,Additional Claim Information,Additional claim information,',
    '20,Outside Lab?,Indicates if outside lab services were used,' + outsideLab,
    '20,Laboratory Charges,Charges for laboratory services,' + outsideLabCharges,
    '21,Diagnosis or Nature of Illness or Injury,Diagnosis codes,' + diagnosis,
    '22,Resubmission Code,Resubmission code,' + resubmissionCode,
    '22,Original Reference Number,Original reference number,' + originalReference,
    '23,Prior Authorization Number,Prior authorization number,' + priorAuthRefNumber,
    '24A,Date(s) of Service,Dates of service,' + dateOfService,
    '24B,Place of Service,Place of service,' + placeOfService,
    '24C,EMG,EMG indicator,' + emergency,
    '24D,Procedures, Services, or Supplies,Procedure codes,' + procedureCode,
    '24D,Procedures, Services, or Supplies,Modifiers,' + modifiers,
    '24E,Diagnosis Pointer, Diagnosis pointer,' + diagnosisPointer,
    '24F,Charges,Charges for service,' + charges,
    '24G,Days or Units,Number of days or units,' + daysOrUnits,
    '24H,EPSDT Family Plan,EPSDT family plan indicator,' + familyPlanIndicator,
    '24I,ID Qualifier,ID qualifier,',
    '24J,Rendering Provider ID #,Rendering provider ID number,',
    '25,Federal Tax ID Number,Federal tax ID number,' + fedTaxNumber,
    '25,Federal Tax ID Type,Federal tax ID type,' + fedTaxType,
    "26,Patient's Account Number,Patient's account number," + patientAccountNumber,
    '27,Accept Assignment?,Indicates if provider accepts assignment,',
    '28,Total Charge,Total charge for services,' + totalCharge,
    '29,Amount Paid,Amount paid,' + patientPaid,
    '30,Rsvd for NUCC Use,Reserved for NUCC use,',
    '31,Signature of Physician or Supplier,Signature of physician or supplier,',
    '32,Service Facility Location Information,Location of service facility,' + serviceLocation,
    '32a,Service Facility NPI,NPI of service facility,' + serviceNpi,
    '32b,Other ID #,Other ID number of service facility,',
    '33,Billing Provider Info & Ph #,Billing provider information and phone number,' +
      billingLocation +
      billingPhoneNumber,
    '33a,Billing Provider NPI,NPI of billing provider,' + providerNpi,
    '33b,Other ID #,Other ID number of billing provider,',
  ];

  let cms1500Text: string = '';

  for (const line of cms1500Lines) {
    cms1500Text += line + '\n';
  }

  const text = await medplum.createAttachment({ data: cms1500Text, contentType: 'text' });
  const cms1500: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    content: [
      {
        attachment: text,
      },
    ],
    context: {
      related: [{ reference: getReferenceString(claim) }],
    },
  };
  console.log(cms1500Text);
  return cms1500;
}

export function getPatientInfo(patient: Patient): Record<string, string> {
  const patientName = patient.name?.[0] ? formatHumanName(patient.name?.[0]) : '';
  const patientDob = formatDate(patient.birthDate);
  const patientSex = patient.gender ?? '';
  const patientAddress = patient.address ? formatAddress(patient.address?.[0]) : '';

  return {
    patientName,
    patientDob,
    patientSex,
    patientAddress,
  };
}

function getCoverageInfo(coverage: Coverage): Record<string, string> {
  const insuranceType = coverage.type?.coding?.[0].display ?? '';
  const insuredIdNumber = coverage.identifier?.find((id) => id.use === 'official')?.value ?? '';
  const relation = coverage.relationship?.coding?.[0].display ?? '';
  const coverageName = coverage.payor[0].display ?? '';

  return {
    insuranceType,
    insuredIdNumber,
    relation,
    coverageName,
  };
}

function getInsuredInfo(insured: Patient | RelatedPerson | undefined): Record<string, string> {
  if (!insured) {
    return {
      insuredName: '',
      insuredAddress: '',
      insuredDob: '',
      insuredSex: '',
    };
  }

  const insuredName = insured.name ? formatHumanName(insured.name[0]) : '';
  const insuredAddress = insured.address ? formatAddress(insured.address?.[0]) : '';
  const insuredDob = formatDate(insured.birthDate);
  const insuredSex = insured.gender ?? '';

  return {
    insuredName,
    insuredAddress,
    insuredDob,
    insuredSex,
  };
}

function getClaimInfo(claim: Claim): Record<string, string | boolean> {
  const claimInfo: Record<string, string | boolean> = {};
  claimInfo.employmentRelated =
    claim.supportingInfo?.some((info) => info.category.coding?.[0].code === 'employmentimpacted') ?? false;
  claimInfo.autoAccident = claim.accident?.type?.coding?.some((code) => code.code === 'MVA') ?? false;
  claimInfo.accidentLocation = claim.accident?.locationAddress ? formatAddress(claim.accident.locationAddress) : '';
  claimInfo.otherAccident = !claimInfo.autoAccident && !!claim.accident;

  const item = claim.item?.[0];
  if (!item) {
    claimInfo.dateOfService = '';
    claimInfo.placeOfService = '';
    claimInfo.emergency = '';
    claimInfo.procedureCode = '';
    claimInfo.modifiers = '';
    claimInfo.diagnosisPointer = '';
    claimInfo.charges = '';
    claimInfo.daysOrUnits = '';
    claimInfo.familyPlanIndicator = '';
  } else {
    claimInfo.dateOfService = formatDate(item.servicedDate);
    claimInfo.placeOfService = item.locationAddress ? formatAddress(item.locationAddress) : '';
    claimInfo.emergency = item.category?.coding?.[0].code === 'EMG';
    claimInfo.procedureCode = formatCodeableConcept(item.productOrService);
    claimInfo.modifiers = formatCodeableConcept(item.modifier?.[0]);
    claimInfo.diagnosisPointer = item.diagnosisSequence?.[0] + '';
    claimInfo.charges = formatMoney(item.net);
    claimInfo.daysOrUnits = formatQuantity(item.quantity);
    claimInfo.familyPlanIndicator = formatCodeableConcept(item.programCode?.[0]);
  }

  const employmentImpacted = claim.supportingInfo?.find(
    (info) => info.category.coding?.[0].code === 'employmentimpacted'
  );
  claimInfo.employmentImpactedStart = employmentImpacted?.timingPeriod?.start ?? '';
  claimInfo.employmentimpactedEnd = employmentImpacted?.timingPeriod?.end ?? '';
  claimInfo.patientAccountNumber =
    claim.supportingInfo?.find(
      (info) =>
        info.category?.coding?.find((code) => code.code === 'info') &&
        info.code?.coding?.find((code) => code.code === 'patientaccount')
    )?.valueString ?? '';
  claimInfo.patientPaid = formatQuantity(
    claim.supportingInfo?.find(
      (info) =>
        info.category?.coding?.find((code) => code.code === 'info') &&
        info.code?.coding?.find((code) => code.code === 'patientpaid')
    )?.valueQuantity
  );
  claimInfo.totalCharge = formatMoney(claim.total);
  claimInfo.dateOfCurrentIllness = formatDate(
    claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'onset')?.timingDate
  );
  claimInfo.otherClaim = claim.related?.[0].claim?.display ?? '';

  const hospitalization = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'hospitalized');
  claimInfo.hospitalizationStart = hospitalization?.timingPeriod?.start
    ? formatDate(hospitalization.timingPeriod.start)
    : '';
  claimInfo.hospitalizationEnd = hospitalization?.timingPeriod?.end ? formatDate(hospitalization.timingPeriod.end) : '';

  claimInfo.diagnosis =
    claim.diagnosis?.[0].diagnosisCodeableConcept?.coding?.find(
      (code) => code.system === 'http://hl7.org/fhir/sid/icd-10'
    )?.code ?? '';
  claimInfo.resubmissionCode =
    claim.related?.[0].relationship?.coding?.find((code) => code.code === 'prior')?.display ?? '';
  claimInfo.originalReference = claim.related?.[0].claim?.display ?? '';
  claimInfo.priorAuthRefNumber = claim.insurance[0].preAuthRef?.[0] ?? '';

  const outsideLab = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'outsidelab');
  if (outsideLab) {
    claimInfo.outsideLab = !!outsideLab;
    claimInfo.outsideLabCharges = formatQuantity(outsideLab.valueQuantity);
  } else {
    claimInfo.outsideLab = '';
    claimInfo.outsideLabCharges = '';
  }

  return claimInfo;
}

function getOtherInfo(
  coverage: Coverage | undefined,
  insured: Patient | RelatedPerson | undefined
): Record<string, string> {
  const otherInfo: Record<string, string> = {};
  if (!coverage) {
    return {
      otherPolicy: '',
      otherPolicyName: '',
      otherInsuredName: '',
    };
  }

  const plan = coverage.class?.find(
    (classification) =>
      classification.type.coding?.[0].code === 'plan' || classification.type.coding?.[0].code === 'group'
  );

  otherInfo.otherPolicy = formatCodeableConcept(plan?.type);
  otherInfo.otherPolicyName = plan?.name ?? '';
  otherInfo.otherInsuredName = insured?.name?.[0] ? formatHumanName(insured?.name?.[0]) : '';

  return otherInfo;
}

export function getReferralInfo(
  referrer?: Practitioner | Organization | Device | Patient | RelatedPerson | PractitionerRole
): Record<string, string> {
  const referralInfo: Record<string, string> = {};
  if (
    !referrer ||
    referrer.resourceType === 'Device' ||
    referrer.resourceType === 'Patient' ||
    referrer.resourceType === 'RelatedPerson' ||
    referrer.resourceType === 'PractitionerRole'
  ) {
    referralInfo.referrerName = '';
    referralInfo.referrerNpi = '';
    return referralInfo;
  }

  if (referrer.resourceType === 'Organization') {
    referralInfo.referrerName = referrer.name ?? '';
  } else {
    referralInfo.referrerName = referrer.name?.[0] ? formatHumanName(referrer.name[0]) : '';
  }
  referralInfo.referrerNpi = referrer?.identifier?.find((id) => id.type?.coding?.[0].code === 'NPI')?.value ?? '';

  return referralInfo;
}

export function getInsurerInfo(insurer: Organization | Patient | RelatedPerson): Record<string, string> {
  const insurerInfo: Record<string, string> = {};
  if (insurer.resourceType === 'Patient' || insurer.resourceType === 'RelatedPerson') {
    insurerInfo.serviceNPI = '';
    insurerInfo.serviceLocation = '';
    insurerInfo.fedTaxNumber = '';
    insurerInfo.fedTaxType = '';
    return insurerInfo;
  }

  insurerInfo.serviceNpi =
    insurer.identifier?.find((id) => id.type?.coding?.find((code) => code.code === 'NPI'))?.id ?? '';
  insurerInfo.serviceLocation = insurer.address ? formatAddress(insurer.address[0]) : '';

  const taxIdentifier = insurer.identifier?.find((id) => id.type?.coding?.find((code) => code.code === 'TAX'));
  insurerInfo.fedTaxNumber = taxIdentifier?.value ?? '';
  insurerInfo.fedTaxType = taxIdentifier?.system ?? '';

  return insurerInfo;
}

export function getProviderInfo(provider: Practitioner | Organization | PractitionerRole): Record<string, string> {
  const providerInfo: Record<string, string> = {};
  if (provider.resourceType === 'PractitionerRole') {
    return {
      billingLocation: '',
      billingPhoneNumber: '',
      providerNpi: '',
    };
  }

  providerInfo.billingLocation = provider?.address?.[0] ? formatAddress(provider.address?.[0]) : '';
  const phoneNumber = provider.telecom?.find((comm) => comm.system === 'phone');
  providerInfo.billingPhoneNumber = phoneNumber?.value ?? '';
  providerInfo.providerNpi = provider.identifier?.find((id) => id.id === 'NPI')?.value ?? '';

  return providerInfo;
}
