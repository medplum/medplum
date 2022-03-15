import { Patient, Reference } from '@medplum/fhirtypes';
import { Avatar, HumanNameDisplay, MedplumLink, Scrollable, useResource } from '@medplum/ui';
import React from 'react';
import './PatientHeader.css';

export interface PatientHeaderProps {
  patient: Patient | Reference<Patient>;
}

export function PatientHeader(props: PatientHeaderProps): JSX.Element | null {
  const patient = useResource(props.patient);
  if (!patient) {
    return null;
  }
  return (
    <Scrollable className="medplum-surface" height={74}>
      <div className="medplum-patient-header">
        <Avatar value={patient} size="large" color={getDefaultColor(patient)} />
        <dl>
          <dt>Name</dt>
          <dd>
            <MedplumLink to={patient}>
              {patient.name ? <HumanNameDisplay value={patient.name?.[0]} options={{ use: false }} /> : '[blank]'}
            </MedplumLink>
          </dd>
        </dl>
        {patient.birthDate && (
          <>
            <dl>
              <dt>DoB</dt>
              <dd>{patient.birthDate}</dd>
            </dl>
            <dl>
              <dt>Age</dt>
              <dd>{getAge(patient)}</dd>
            </dl>
          </>
        )}
        {patient.gender && (
          <dl>
            <dt>Gender</dt>
            <dd>{patient.gender}</dd>
          </dl>
        )}
        {patient.identifier?.map((identifier) => (
          <dl key={identifier?.system}>
            <dt>{identifier?.system}</dt>
            <dd>{identifier?.value}</dd>
          </dl>
        ))}
      </div>
    </Scrollable>
  );
}

function getDefaultColor(patient: Patient): string {
  if (patient.gender === 'male') {
    return '#79a3d2'; // blue
  }
  if (patient.gender === 'female') {
    return '#c58686'; // pink
  }
  return '#6cb578'; // green
}

function getAge(patient: Patient): string | undefined {
  if (!patient.birthDate) {
    return undefined;
  }

  const birthDate = new Date(patient.birthDate);
  const years = getAgeInYears(birthDate);
  const months = getAgeInMonths(birthDate);
  if (years >= 2) {
    return years.toString().padStart(3, '0') + 'Y';
  } else {
    return months.toString().padStart(3, '0') + 'M';
  }
}

function getAgeInYears(birthDate: Date): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let years = today.getUTCFullYear() - birthDate.getUTCFullYear();
  if (
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    years--;
  }
  return years;
}

function getAgeInMonths(birthDate: Date): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let months =
    today.getUTCFullYear() * 12 + today.getUTCMonth() - (birthDate.getUTCFullYear() * 12 + birthDate.getUTCMonth());
  if (today.getUTCDate() < birthDate.getUTCDate()) {
    months--;
  }
  return months;
}
