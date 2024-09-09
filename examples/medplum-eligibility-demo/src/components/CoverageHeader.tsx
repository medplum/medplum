import { getDisplayString } from '@medplum/core';
import { Patient, Reference, Organization, RelatedPerson } from '@medplum/fhirtypes';
import { HumanNameDisplay, MedplumLink, useResource } from '@medplum/react';
import styles from './CoverageHeader.module.css';

interface CoverageHeaderProps {
  readonly patient: Patient;
  readonly payor?: Reference<Organization | Patient | RelatedPerson>;
}

export function CoverageHeader(props: CoverageHeaderProps): JSX.Element {
  const payor = useResource(props.payor);

  return (
    <div className={styles.coverageHeader}>
      <dl>
        <dt>Patient</dt>
        <dd>
          <MedplumLink to={props.patient}>
            <HumanNameDisplay value={props.patient.name?.[0]} options={{ use: false }} />
          </MedplumLink>
        </dd>
      </dl>
      <dl>
        <dt>Payor</dt>
        <dd>
          <MedplumLink to={props.payor}>{payor ? getDisplayString(payor) : 'Payor Unknown'}</MedplumLink>
        </dd>
      </dl>
    </div>
  );
}
