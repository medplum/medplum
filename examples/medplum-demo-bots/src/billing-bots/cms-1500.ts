import { BotEvent, formatDate, formatHumanName, MedplumClient } from '@medplum/core';
import { Address, Claim } from '@medplum/fhirtypes';

interface CMS1500Output {
  insuranceProgramName: string;
  insuredIdNumber: string;
  patientName: string;
  patientDob: string;
  patientGender: string;
  insuredName: string;
  patientAddress: Address;
  patientRelation: string;
  insuredAddress: Address;
  // otherInsured: string;
  // patientConditionRelationData: string;
}

export async function handler(medplum: MedplumClient, event: BotEvent<Claim>) {
  const claim = event.input;
  const coverage = await medplum.readReference(claim.insurance[0].coverage);
  const patient = await medplum.readReference(claim.patient);
  const provider = await medplum.readReference(claim.provider);
  const insurer = await medplum.readReference(coverage.payor[0]);
  const insured = coverage.subscriber ? await medplum.readReference(coverage.subscriber) : undefined;
  const insuranceType = coverage.type?.coding?.[0].display ?? '';
  const insuredIdNumber = coverage.identifier?.find((id) => id.use === 'official')?.value ?? '';
  const patientName = patient.name?.[0] ? formatHumanName(patient.name[0]) : '';
  const patientDob = patient.birthDate ? formatDate(patient.birthDate) : '';
  const patientSex = patient.gender ?? '';

  const cms1500 = {
    insuranceType:
      '1,Insurance Program Name,Indicates type of health insurance coverage applicable to the claim,' + insuranceType,
    insuredIdNumber: "1a,Insured's ID Number,Identification number of the insured person," + insuredIdNumber,
    patientName: "2,Patient's Name,Full name of the patient," + patientName,
    patientDob: "3,Patient's Birth Date,Date of birth of patient," + patientDob,
    patientSex: "3,Patient's Sex,Gender of the patient" + patientSex,
  };

  const patientAddress = patient.address;

  const patientData = {
    sex: patient.gender,
    patientAddress: patientAddress,
  };
}
