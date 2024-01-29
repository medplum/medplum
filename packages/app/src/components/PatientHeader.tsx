import { calculateAgeString } from '@medplum/core';
import { Patient, Reference } from '@medplum/fhirtypes';
import { HumanNameDisplay, MedplumLink, ResourceAvatar, useResource } from '@medplum/react';
import { InfoBar } from './InfoBar';
import { getDefaultColor } from './PatientHeader.utils';

export interface PatientHeaderProps {
  readonly patient: Patient | Reference<Patient>;
}

export function PatientHeader(props: PatientHeaderProps): JSX.Element | null {
  const patient = useResource(props.patient);
  if (!patient) {
    return null;
  }
  return (
    <InfoBar>
      <ResourceAvatar value={patient} size="lg" color={getDefaultColor(patient)} />
      <InfoBar.Entry>
        <InfoBar.Key>Name</InfoBar.Key>
        <InfoBar.Value>
          <MedplumLink to={patient} fw={500}>
            {patient.name ? <HumanNameDisplay value={patient.name[0]} options={{ use: false }} /> : '[blank]'}
          </MedplumLink>
        </InfoBar.Value>
      </InfoBar.Entry>
      {patient.birthDate && (
        <>
          <InfoBar.Entry>
            <InfoBar.Key>DoB</InfoBar.Key>
            <InfoBar.Value>{patient.birthDate}</InfoBar.Value>
          </InfoBar.Entry>
          <InfoBar.Entry>
            <InfoBar.Key>Age</InfoBar.Key>
            <InfoBar.Value>{calculateAgeString(patient.birthDate)}</InfoBar.Value>
          </InfoBar.Entry>
        </>
      )}
      {patient.gender && (
        <InfoBar.Entry>
          <InfoBar.Key>Gender</InfoBar.Key>
          <InfoBar.Value>{patient.gender}</InfoBar.Value>
        </InfoBar.Entry>
      )}
      {patient.address && (
        <InfoBar.Entry>
          <InfoBar.Key>State</InfoBar.Key>
          <InfoBar.Value>{patient.address[0]?.state}</InfoBar.Value>
        </InfoBar.Entry>
      )}
      {patient.identifier?.map((identifier) => (
        <InfoBar.Entry key={`${identifier?.system}-${identifier?.value}`}>
          <InfoBar.Key>{identifier?.system}</InfoBar.Key>
          <InfoBar.Value>{identifier?.value}</InfoBar.Value>
        </InfoBar.Entry>
      ))}
    </InfoBar>
  );
}
