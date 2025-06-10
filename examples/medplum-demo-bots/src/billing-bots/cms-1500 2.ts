import {
  BotEvent,
  createReference,
  formatAddress,
  formatCodeableConcept,
  formatDate,
  formatHumanName,
  formatMoney,
  formatPeriod,
  formatQuantity,
  getDisplayString,
  MedplumClient,
} from '@medplum/core';
import { Claim, DocumentReference, Practitioner } from '@medplum/fhirtypes';

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

  const plan = coverage.class?.find(
    (classification) =>
      classification.type.coding?.[0].code === 'plan' || classification.type.coding?.[0].code === 'group'
  );

  const otherPlan = otherCoverage?.class?.find(
    (classification) =>
      classification.type.coding?.[0].code === 'plan' || classification.type.coding?.[0].code === 'group'
  );

  const employmentRelated =
    claim.supportingInfo?.some((info) => info.category.coding?.[0].code === 'employmentimpacted') ?? false;
  const autoAccident = claim.accident?.type?.coding?.some((code) => code.code === 'MVA') ?? false;

  const employmentImpacted = claim.supportingInfo?.find(
    (info) => info.category.coding?.[0].code === 'employmentimpacted'
  );

  const hospitalization = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'hospitalized');

  const outsideLab = claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'outsidelab');

  const taxIdentifier = insurer.identifier?.find((id) => id.type?.coding?.find((code) => code.code === 'TAX'));

  const providerAddress = (provider as Practitioner | undefined)?.address?.[0];

  const cms1500Lines = [
    'Field Number,Field Name,Description,',
    `1,Insurance Program Name,Indicates type of health insurance coverage applicable to the claim,${coverage.type?.coding?.[0].display ?? ''}`,
    `1a,Insured's ID Number,Identification number of the insured person,${coverage.identifier?.find((id) => id.use === 'official')?.value ?? ''}`,
    `2,Patient's Name,Full name of the patient,${patient.name?.[0] ? formatHumanName(patient.name?.[0]) : ''}`,
    `3,Patient's Birth Date,Date of birth of patient,${formatDate(patient.birthDate)}`,
    `3,Patient's Sex,Gender of the patient,${patient.gender ?? ''}`,
    `4,Insured's Name,Full name of the insured person,${insured?.name ? formatHumanName(insured.name[0]) : ''}`,
    `5,Patient's Address,Address of the patient,${patient.address ? formatAddress(patient.address?.[0]) : ''}`,
    `6,Patient Relationship to Insured,Relationship of the patient to the insured,${coverage.relationship?.coding?.[0].display ?? ''}`,
    `7,Insured's Address,Address of the insured person,${insured?.address ? formatAddress(insured.address?.[0]) : ''}`,
    '8,Reserved for NUCC Use,Reserved for NUCC use',
    `9,Other Insured's Name,Full name of other insured if applicable,${otherInsured?.name?.[0] ? formatHumanName(otherInsured?.name?.[0]) : ''}`,
    `9a,Other Insured's Policy or Group Number,Policy or group number of other insured,${formatCodeableConcept(otherPlan?.type)}`,
    '9b,Reserved for NUCC Use,Reserved for NUCC use',
    '9c,Reserved for NUCC Use,Reserved for NUCC use',
    `9d,Insurance Plan Name or Program Name,Insurance plan name or program name of other insured,${plan?.name ?? ''}`,
    `10a,Is Patient's Condition Related to Employment?,Indicates if patient's condition is related to employment,${employmentRelated}`,
    `10b,Is Patient's Condition Related to Auto Accident?,Indicates if patient's condition is related to auto accident,${autoAccident}`,
    `10b,Accident Location,Location of the related auto accident,${claim.accident?.locationAddress ? formatAddress(claim.accident.locationAddress) : ''}`,
    `10c,Is Patient's Condition Related to Other Accident?,Indicates if patient's condition is related to other accident,${!autoAccident && !autoAccident}`,
    "11,Insured's Policy Group or FECA Number,Policy group or FECA number of insured,",
    `11a,Insured's Date of Birth,Date of birth of insured,${formatDate(insured?.birthDate)}`,
    `11b,Insured's Sex,Gender of insured,${insured?.gender ?? ''}`,
    `11b,Other Claim ID,Other claim ID,${claim.related?.[0].claim?.display ?? ''}`,
    `11c,Insurance Plan Name or Program Name,Insurance plan name or program name,${coverage.payor[0].display ?? ''}`,
    '11d,Is There Another Health Benefit Plan?,Indicates if there is another health benefit plan,',
    "12,Patient's or Authorized Person's Signature,Signature of patient or authorized person,",
    "13,Insured's or Authorized Person's Signature,Signautre of insured or authorized person,",
    `14,Date of Current Illness/Injury/Pregnancy,Date of current illness/injury/pregnancy,${formatDate(
      claim.supportingInfo?.find((info) => info.category.coding?.[0].code === 'onset')?.timingDate
    )}`,
    '15,Other Date,Other date,',
    `16,Dates Patient Unable to Work in Current Occupation,Dates patient unable to work in current occupation,${formatPeriod(employmentImpacted?.timingPeriod)}`,
    `17,Name of Referring Provider or Other Source,Full name of referring provider or other source,${referrer ? getDisplayString(referrer) : ''}`,
    '17a,Referring Provider Identifier,Identifier of the referring provider,',
    `17b,Referring Provider NPI,NPI of the referring provider,${referrer?.identifier?.find((id) => id.type?.coding?.[0].code === 'NPI')?.value ?? ''}`,
    `18,Hospitalization Dates Related to Current Services,Dates of hospitalization related to current services,${formatPeriod(hospitalization?.timingPeriod)}`,
    '19,Additional Claim Information,Additional claim information,',
    `20,Outside Lab?,Indicates if outside lab services were used,${!!outsideLab}`,
    `20,Laboratory Charges,Charges for laboratory services,${formatQuantity(outsideLab?.valueQuantity)}`,
    `21,Diagnosis or Nature of Illness or Injury,Diagnosis codes,${
      claim.diagnosis?.[0].diagnosisCodeableConcept?.coding?.find(
        (code) => code.system === 'http://hl7.org/fhir/sid/icd-10'
      )?.code ?? ''
    }`,
    `22,Resubmission Code,Resubmission code,${claim.related?.[0].relationship?.coding?.find((code) => code.code === 'prior')?.display ?? ''}`,
    `22,Original Reference Number,Original reference number,${claim.related?.[0].claim?.display ?? ''}`,
    `23,Prior Authorization Number,Prior authorization number,${claim.insurance[0].preAuthRef?.[0] ?? ''}`,
    `24A,Date(s) of Service,Dates of service,${formatDate(claim.item?.[0]?.servicedDate)}`,
    `24B,Place of Service,Place of service,${claim.item?.[0]?.locationAddress ? formatAddress(claim.item?.[0]?.locationAddress) : ''}`,
    `24C,EMG,EMG indicator,${claim.item?.[0]?.category?.coding?.[0].code === 'EMG'}`,
    `24D,Procedures, Services, or Supplies,Procedure codes,${formatCodeableConcept(claim.item?.[0]?.productOrService)}`,
    `24D,Procedures, Services, or Supplies,Modifiers,${formatCodeableConcept(claim.item?.[0]?.modifier?.[0])}`,
    `24E,Diagnosis Pointer, Diagnosis pointer,${claim.item?.[0]?.diagnosisSequence?.[0] + ''}`,
    `24F,Charges,Charges for service,${formatMoney(claim.item?.[0]?.net)}`,
    `24G,Days or Units,Number of days or units,${formatQuantity(claim.item?.[0]?.quantity)}`,
    `24H,EPSDT Family Plan,EPSDT family plan indicator,${formatCodeableConcept(claim.item?.[0]?.programCode?.[0])}`,
    '24I,ID Qualifier,ID qualifier,',
    '24J,Rendering Provider ID #,Rendering provider ID number,',
    `25,Federal Tax ID Number,Federal tax ID number,${taxIdentifier?.value ?? ''}`,
    `25,Federal Tax ID Type,Federal tax ID type,${taxIdentifier?.system ?? ''}`,
    `26,Patient's Account Number,Patient's account number,${
      claim.supportingInfo?.find(
        (info) =>
          info.category?.coding?.find((code) => code.code === 'info') &&
          info.code?.coding?.find((code) => code.code === 'patientaccount')
      )?.valueString ?? ''
    }`,
    '27,Accept Assignment?,Indicates if provider accepts assignment,',
    `28,Total Charge,Total charge for services,${formatMoney(claim.total)}`,
    `29,Amount Paid,Amount paid,${formatQuantity(
      claim.supportingInfo?.find(
        (info) =>
          info.category?.coding?.find((code) => code.code === 'info') &&
          info.code?.coding?.find((code) => code.code === 'patientpaid')
      )?.valueQuantity
    )}`,
    '30,Rsvd for NUCC Use,Reserved for NUCC use,',
    '31,Signature of Physician or Supplier,Signature of physician or supplier,',
    `32,Service Facility Location Information,Location of service facility,${insurer.address ? formatAddress(insurer.address[0]) : ''}`,
    `32a,Service Facility NPI,NPI of service facility,${insurer.identifier?.find((id) => id.type?.coding?.find((code) => code.code === 'NPI'))?.id ?? ''}`,
    '32b,Other ID #,Other ID number of service facility,',
    `33,Billing Provider Info & Ph #,Billing provider information and phone number,${providerAddress ? formatAddress(providerAddress) : ''} ${provider.telecom?.find((comm) => comm.system === 'phone')?.value ?? ''}`,
    `33a,Billing Provider NPI,NPI of billing provider,${provider.identifier?.find((id) => id.id === 'NPI')?.value ?? ''}`,
    '33b,Other ID #,Other ID number of billing provider,',
  ];

  const data = cms1500Lines.join('\n') + '\n';
  const attachment = await medplum.createAttachment({ data, contentType: 'text' });
  const cms1500: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    content: [{ attachment }],
    context: { related: [createReference(claim)] },
  };
  return cms1500;
}
