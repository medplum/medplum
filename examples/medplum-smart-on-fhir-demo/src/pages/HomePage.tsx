import { Button, Container, Stack, Text, Title } from '@mantine/core';
import { JSX } from 'react';
import { MEDPLUM_CLIENT_ID, MEDPLUM_FHIR_URL, SMART_HEALTH_IT_CLIENT_ID, SMART_HEALTH_IT_FHIR_URL, STANDALONE_SCOPE } from '../config';

async function initiateLaunch(clientId: string, fhirUrl: string): Promise<void> {
  // Store the FHIR base URL so LaunchPage can find it after the redirect
  sessionStorage.setItem('smart_fhir_url', fhirUrl);

  // Generate and store state for CSRF protection
  const state = crypto.randomUUID();
  sessionStorage.setItem('smart_state', state);

  // Discover the authorization endpoint from the SMART configuration
  const response = await fetch(`${fhirUrl}/.well-known/smart-configuration`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch SMART configuration');
  }
  const config = await response.json();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: STANDALONE_SCOPE,
    redirect_uri: window.location.origin + '/launch',
    state,
    aud: fhirUrl,
  });

  window.location.href = `${config.authorization_endpoint}?${params.toString()}`;
}

interface LaunchButtonProps {
  clientId: string;
  fhirUrl: string;
  children: React.ReactNode;
}

function LaunchButton({ clientId, fhirUrl, children }: LaunchButtonProps): JSX.Element {
  const handleClick = (): void => {
    initiateLaunch(clientId, fhirUrl).catch(console.error);
  };

  return <div onClick={handleClick}>{children}</div>;
}

export function HomePage(): JSX.Element {
  return (
    <Container size="md" mt="xl">
      <Stack>
        <Title order={1}>Medplum SMART on FHIR Demo</Title>
        <Text>
          This is a demonstration of SMART on FHIR capabilities using Medplum. You can launch this app from any
          SMART-enabled EHR system.
        </Text>
        <Text>To test the app, you can use one of these launch options:</Text>

        <LaunchButton clientId={MEDPLUM_CLIENT_ID} fhirUrl={MEDPLUM_FHIR_URL}>
          <Button>Launch with Medplum</Button>
        </LaunchButton>

        <LaunchButton clientId={SMART_HEALTH_IT_CLIENT_ID} fhirUrl={SMART_HEALTH_IT_FHIR_URL}>
          <Button>Launch with SMART Health IT Sandbox</Button>
        </LaunchButton>
      </Stack>
    </Container>
  );
}
