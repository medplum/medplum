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

/**
 * Extension URL for configuring custom URL parameters in SMART app launch.
 * Multiple extensions with this URL can be present, each defining one custom parameter.
 * Each extension specifies:
 * - `name`: The URL parameter name
 * - `sourceType`: Where to get the value from (e.g., "patientIdentifier", "encounterIdentifier", "resourceId", "static")
 * - `system`: For identifier sources, the identifier system to use
 * - `value`: For static sources, the static value to use
 */
const SMART_LAUNCH_URL_PARAMETER_EXTENSION_URL =
  'https://medplum.com/fhir/StructureDefinition/smart-launch-url-parameter';

type ParameterSourceType = 'patientIdentifier' | 'encounterIdentifier' | 'patientId' | 'encounterId' | 'static';

interface CustomParameter {
  name: string;
  sourceType: ParameterSourceType;
  system?: string;
  value?: string;
}

export function SmartAppLaunchLink(props: SmartAppLaunchLinkProps): JSX.Element | null {
  const medplum = useMedplum();
  const { client, patient, encounter, children, ...rest } = props;

  // Load resources if we need to extract values
  // Always call useResource hook (React hooks rules), it handles undefined gracefully
  const patientResource = useResource(patient);
  const encounterResource = useResource(encounter);

  /**
   * Extracts custom parameters from ClientApplication extensions.
   * @returns Array of custom parameter configurations.
   */
  function getCustomParameters(): CustomParameter[] {
    const parameters: CustomParameter[] = [];
    const extensions = client.extension?.filter((e) => e.url === SMART_LAUNCH_URL_PARAMETER_EXTENSION_URL) || [];

    for (const extension of extensions) {
      const nameExtension = extension.extension?.find((e) => e.url === 'name');
      const sourceTypeExtension = extension.extension?.find((e) => e.url === 'sourceType');
      const systemExtension = extension.extension?.find((e) => e.url === 'system');
      const valueExtension = extension.extension?.find((e) => e.url === 'value');

      const name = nameExtension?.valueString;
      const sourceType = sourceTypeExtension?.valueString as ParameterSourceType | undefined;
      const system = systemExtension?.valueUri || systemExtension?.valueString;
      const value = valueExtension?.valueString;

      if (name && sourceType) {
        parameters.push({
          name,
          sourceType,
          system,
          value,
        });
      }
    }

    return parameters;
  }

  /**
   * Resolves the value for a custom parameter based on its source type.
   * @param parameter - The custom parameter configuration.
   * @returns The resolved parameter value, or undefined if not available.
   */
  function resolveParameterValue(parameter: CustomParameter): string | undefined {
    switch (parameter.sourceType) {
      case 'patientIdentifier':
        if (!patientResource || !parameter.system) {
          return undefined;
        }
        return getIdentifier(patientResource, parameter.system);

      case 'encounterIdentifier':
        if (!encounterResource || !parameter.system) {
          return undefined;
        }
        return getIdentifier(encounterResource, parameter.system);

      case 'patientId':
        return patientResource?.id;

      case 'encounterId':
        return encounterResource?.id;

      case 'static':
        return parameter.value;

      default:
        return undefined;
    }
  }

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

        // Process custom parameters from extensions
        const customParameters = getCustomParameters();
        for (const parameter of customParameters) {
          const paramValue = resolveParameterValue(parameter);

          if (paramValue) {
            url.searchParams.set(parameter.name, paramValue);
            continue;
          }

          // Show warning if required resource/identifier is missing
          if (
            (parameter.sourceType === 'patientIdentifier' || parameter.sourceType === 'patientId') &&
            !patientResource
          ) {
            showNotification({
              color: 'yellow',
              message: `Parameter "${parameter.name}" requires a Patient resource`,
              autoClose: 5000,
            });
          } else if (
            (parameter.sourceType === 'encounterIdentifier' || parameter.sourceType === 'encounterId') &&
            !encounterResource
          ) {
            showNotification({
              color: 'yellow',
              message: `Parameter "${parameter.name}" requires an Encounter resource`,
              autoClose: 5000,
            });
          } else if (
            (parameter.sourceType === 'patientIdentifier' || parameter.sourceType === 'encounterIdentifier') &&
            parameter.system
          ) {
            showNotification({
              color: 'yellow',
              message: `Identifier with system "${parameter.system}" not found for parameter "${parameter.name}"`,
              autoClose: 5000,
            });
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
