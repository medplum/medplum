// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ensureTrailingSlash, getIdentifier, locationUtils, normalizeErrorString } from '@medplum/core';
import type { ClientApplication, Encounter, Patient, Reference, SmartAppLaunch } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';

export interface SmartAppLaunchLinkProps extends AnchorProps {
  readonly client: ClientApplication;
  readonly patient?: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  readonly children?: ReactNode;
}

export function SmartAppLaunchLink(props: SmartAppLaunchLinkProps): JSX.Element | null {
  const medplum = useMedplum();
  const { client, patient, encounter, children, ...rest } = props;
  const patientResource = useResource(patient);
  const encounterResource = useResource(encounter);

  function launchApp(): void {
    // Build the patient reference, potentially including an identifier
    let patientRef: Reference<Patient> | undefined = patient;
    let encounterRef: Reference<Encounter> | undefined = encounter;

    if (client.launchIdentifierSystems?.length) {
      // Find patient identifier system configuration
      const patientIdentifierConfig = client.launchIdentifierSystems.find(
        (config) => config.resourceType === 'Patient'
      );
      if (patient && patientResource && patientIdentifierConfig?.system) {
        const patientIdentifierValue = getIdentifier(patientResource, patientIdentifierConfig.system);
        if (patientIdentifierValue) {
          // Include both the reference and the identifier in the patient reference
          patientRef = {
            ...patient,
            identifier: {
              system: patientIdentifierConfig.system,
              value: patientIdentifierValue,
            },
          };
        }
      }

      // Find encounter identifier system configuration
      const encounterIdentifierConfig = client.launchIdentifierSystems.find(
        (config) => config.resourceType === 'Encounter'
      );
      if (encounter && encounterResource && encounterIdentifierConfig?.system) {
        const encounterIdentifierValue = getIdentifier(encounterResource, encounterIdentifierConfig.system);
        if (encounterIdentifierValue) {
          // Include both the reference and the identifier in the encounter reference
          encounterRef = {
            ...encounter,
            identifier: {
              system: encounterIdentifierConfig.system,
              value: encounterIdentifierValue,
            },
          };
        }
      }
    }

    medplum
      .createResource<SmartAppLaunch>({
        resourceType: 'SmartAppLaunch',
        patient: patientRef,
        encounter: encounterRef,
      })
      .then((result) => {
        const url = new URL(client.launchUri as string);
        url.searchParams.set('iss', ensureTrailingSlash(medplum.fhirUrl().toString()));
        url.searchParams.set('launch', result.id);
        locationUtils.assign(url.toString());
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Anchor onClick={() => launchApp()} {...rest}>
      {children}
    </Anchor>
  );
}
