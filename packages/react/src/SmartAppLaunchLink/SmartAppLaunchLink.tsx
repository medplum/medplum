// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  ensureTrailingSlash,
  getIdentifier,
  locationUtils,
  normalizeErrorString,
} from '@medplum/core';
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

  function launchApp(): void {
    // Build the patient reference, potentially including an identifier
    let patientRef: Reference<Patient> | undefined = patient;

    if (patient && patientResource && client.launchIdentifierSystem) {
      const patientIdentifierValue = getIdentifier(patientResource, client.launchIdentifierSystem);
      if (patientIdentifierValue) {
        // Include both the reference and the identifier in the patient reference
        patientRef = {
          ...patient,
          identifier: {
            system: client.launchIdentifierSystem,
            value: patientIdentifierValue,
          },
        };
      }
    }

    medplum
      .createResource<SmartAppLaunch>({
        resourceType: 'SmartAppLaunch',
        patient: patientRef,
        encounter,
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
