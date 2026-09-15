// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Loader, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { CandidProviderRegistration } from '../../hooks/useCandidProviderRegistration';

export interface CandidRegistrationAlertProps {
  readonly registration: CandidProviderRegistration;
  /**
   * What saving registers when Candid does not have this provider yet; undefined when the
   * candid-create-provider bot is not deployed and saving registers nothing.
   */
  readonly registersAs?: string;
}

/**
 * What Candid says about the provider being edited, looked up live by NPI when the form opens.
 * @param props - The registration state and what saving would register.
 * @returns The alert, or null when there is nothing to report.
 */
export function CandidRegistrationAlert(props: CandidRegistrationAlertProps): JSX.Element | null {
  const { registration, registersAs } = props;

  switch (registration.status) {
    case 'unavailable':
      return null;
    case 'loading':
      return (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Checking Candid...
          </Text>
        </Group>
      );
    case 'registered':
      return (
        <Alert icon={<IconCircleCheck size={16} />} color="green" variant="light">
          Registered with Candid under NPI {registration.npi}.
        </Alert>
      );
    case 'unregistered':
      return (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          Not registered with Candid.{registersAs && ` Saving registers ${registersAs}.`}
        </Alert>
      );
    case 'failed':
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="yellow" variant="light">
          Could not check Candid: {registration.message}. Saving still tries to register.
        </Alert>
      );
    default:
      return null;
  }
}
