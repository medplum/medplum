// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  ensureTrailingSlash,
  getExtensionValue,
  getIdentifier,
  locationUtils,
  normalizeErrorString,
} from '@medplum/core';
import type { ClientApplication, Encounter, Patient, Reference, SmartAppLaunch } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';

/**
 * Extension URL for specifying which patient identifier system to use in the SMART launch context.
 * When this extension is present on a ClientApplication, the patient's identifier with the
 * matching system will be included in the SmartAppLaunch resource's patient reference and
 * returned to the SMART app in the token response.
 */
export const SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM =
  'https://medplum.com/fhir/StructureDefinition/smart-app-launch-patient-identifier-system';

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

    if (patient && patientResource) {
      const identifierSystem = getExtensionValue(client, SMART_APP_LAUNCH_PATIENT_IDENTIFIER_SYSTEM) as
        | string
        | undefined;
      if (identifierSystem) {
        const patientIdentifierValue = getIdentifier(patientResource, identifierSystem);
        if (patientIdentifierValue) {
          // Include both the reference and the identifier in the patient reference
          patientRef = {
            ...patient,
            identifier: {
              system: identifierSystem,
              value: patientIdentifierValue,
            },
          };
        }
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
