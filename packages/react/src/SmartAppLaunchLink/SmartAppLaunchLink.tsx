// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  ensureTrailingSlash,
  getExtension,
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

/**
 * Extension URL for configuring custom patient identifier parameters in SMART app launch.
 * When present on a ClientApplication, this extension specifies:
 * - The patient identifier system to extract from the Patient resource
 * - The URL parameter name to include in the launch URL
 */
const SMART_LAUNCH_PATIENT_IDENTIFIER_EXTENSION_URL =
  'https://medplum.com/fhir/StructureDefinition/smart-launch-patient-identifier';

export function SmartAppLaunchLink(props: SmartAppLaunchLinkProps): JSX.Element | null {
  const medplum = useMedplum();
  const { client, patient, encounter, children, ...rest } = props;

  // Load patient resource if we need to extract identifier
  // Always call useResource hook (React hooks rules), it handles undefined gracefully
  const patientResource = useResource(patient);

  function launchApp(): void {
    medplum
      .createResource<SmartAppLaunch>({
        resourceType: 'SmartAppLaunch',
        patient,
        encounter,
      })
      .then(async (result) => {
        const url = new URL(client.launchUri as string);
        url.searchParams.set('iss', ensureTrailingSlash(medplum.fhirUrl().toString()));
        url.searchParams.set('launch', result.id);

        // Check for extension that specifies custom patient identifier parameter
        const identifierExtension = getExtension(
          client,
          SMART_LAUNCH_PATIENT_IDENTIFIER_EXTENSION_URL
        );

        if (identifierExtension && patientResource) {
          // Get nested extensions for system and parameterName
          const systemExtension = identifierExtension.extension?.find((e) => e.url === 'system');
          const parameterNameExtension = identifierExtension.extension?.find((e) => e.url === 'parameterName');

          // Extract values from nested extensions
          const identifierSystem = systemExtension?.valueUri || systemExtension?.valueString;
          const parameterName = parameterNameExtension?.valueString || 'patient';

          if (identifierSystem) {
            // Extract the identifier value from the patient resource
            const identifierValue = getIdentifier(patientResource, identifierSystem);

            if (identifierValue) {
              url.searchParams.set(parameterName, identifierValue);
            } else {
              showNotification({
                color: 'yellow',
                message: `Patient identifier with system "${identifierSystem}" not found`,
                autoClose: 5000,
              });
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
