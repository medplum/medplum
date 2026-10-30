// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AnchorProps } from '@mantine/core';
import { Anchor } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ensureTrailingSlash, normalizeErrorString } from '@medplum/core';
import type { ClientApplication, Encounter, Patient, Reference, SmartAppLaunch } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';

export interface SmartAppLaunchLinkProps extends AnchorProps {
  readonly client: ClientApplication;
  readonly patient?: Reference<Patient>;
  readonly encounter?: Reference<Encounter>;
  readonly fhirContext?: Reference[];
  readonly children?: ReactNode;
}

export function SmartAppLaunchLink(props: Readonly<SmartAppLaunchLinkProps>): JSX.Element | null {
  const medplum = useMedplum();
  const { client, patient, encounter, children, ...rest } = props;
  const patientResource = useResource(patient);
  const encounterResource = useResource(encounter);

  function launchApp(): void {
    const launchUrl = parseLaunchUrl(client.launchUri);
    if (!launchUrl) {
      showNotification({ color: 'red', message: 'Invalid launch URI', autoClose: false });
      return;
    }

    // Build the patient reference, potentially including an identifier
    let patientRef: Reference<Patient> | undefined = patient;
    let encounterRef: Reference<Encounter> | undefined = encounter;

    if (client.launchIdentifierSystems?.length) {
      // Find patient identifier system configuration
      const patientIdentifierConfig = client.launchIdentifierSystems.find(
        (config) => config.resourceType === 'Patient'
      );
      if (patientRef && patientResource && patientIdentifierConfig?.system) {
        const identifier = patientResource.identifier?.find((i) => i.system === patientIdentifierConfig.system);
        if (identifier) {
          // Include both the reference and the identifier in the patient reference
          patientRef = {
            ...patient,
            identifier: identifier,
          };
        }
      }

      // Find encounter identifier system configuration
      const encounterIdentifierConfig = client.launchIdentifierSystems.find(
        (config) => config.resourceType === 'Encounter'
      );
      if (encounterRef && encounterResource && encounterIdentifierConfig?.system) {
        const identifier = encounterResource.identifier?.find((i) => i.system === encounterIdentifierConfig.system);
        if (identifier) {
          encounterRef = {
            ...encounter,
            identifier: identifier,
          };
        }
      }
    }

    medplum
      .createResource<SmartAppLaunch>({
        resourceType: 'SmartAppLaunch',
        patient: patientRef,
        encounter: encounterRef,
        fhirContext: props.fhirContext,
      })
      .then((result) => {
        launchUrl.searchParams.set('iss', ensureTrailingSlash(medplum.fhirUrl().toString()));
        launchUrl.searchParams.set('launch', result.id);
        window.open(launchUrl.toString(), '_blank');
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Anchor onClick={() => launchApp()} {...rest}>
      {children}
    </Anchor>
  );
}

function parseLaunchUrl(launchUri: string | undefined): URL | undefined {
  if (!launchUri || !URL.canParse(launchUri)) {
    return undefined;
  }
  const url = new URL(launchUri);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
}
