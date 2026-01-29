// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ensureTrailingSlash, getExtensionValue, getIdentifier, locationUtils, normalizeErrorString } from '@medplum/core';
import type { ClientApplication, Encounter, Patient, Reference, SmartAppLaunch } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';

/**
 * Extension URL for specifying which patient identifier system to use in the launch URL.
 * When this extension is present on a ClientApplication, the patient's identifier with the
 * matching system will be included as a 'patient' query parameter in the SMART launch URL.
 */
export const SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM =
  'https://medplum.com/fhir/StructureDefinition/smart-app-launch-patient-identifier-system';

export interface SmartAppLaunchLinkProps extends AnchorProps {
  readonly client: ClientApplication;
  readonly patient?: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  /** Optional full Patient resource used to extract identifier values for launch URL parameters. */
  readonly patientResource?: Patient;
  readonly children?: ReactNode;
}

export function SmartAppLaunchLink(props: SmartAppLaunchLinkProps): JSX.Element | null {
  const medplum = useMedplum();
  const { client, patient, encounter, patientResource, children, ...rest } = props;

  function launchApp(): void {
    medplum
      .createResource<SmartAppLaunch>({
        resourceType: 'SmartAppLaunch',
        patient,
        encounter,
      })
      .then((result) => {
        const url = new URL(client.launchUri as string);
        url.searchParams.set('iss', ensureTrailingSlash(medplum.fhirUrl().toString()));
        url.searchParams.set('launch', result.id);

        // Check if the ClientApplication has an extension specifying a patient identifier system
        // If so, look up the patient's identifier and add it to the launch URL
        if (patientResource) {
          const identifierSystem = getExtensionValue(client, SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM) as
            | string
            | undefined;
          if (identifierSystem) {
            const patientIdentifier = getIdentifier(patientResource, identifierSystem);
            if (patientIdentifier) {
              url.searchParams.set('patient', patientIdentifier);
            }
          }
        }

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
