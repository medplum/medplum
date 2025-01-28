import { Container, Loader, Text } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { useMedplumContext } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FHIR_SCOPE } from '../config';

interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
}

export function LaunchPage(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const medplumContext = useMedplumContext();

  useEffect(() => {
    const handleSmartLaunch = async (): Promise<void> => {
      try {
        const params = new URLSearchParams(window.location.search);

        // Check if this is an EHR launch
        const launch = params.get('launch');
        if (launch) {
          // This is an EHR launch - we need to start the authorization process
          const iss = params.get('iss');
          if (!iss) {
            throw new Error('Missing iss parameter for EHR launch');
          }

          // Store the issuer for later use
          sessionStorage.setItem('smart_iss', iss);

          // First, get the server's SMART configuration
          const wellKnownResponse = await fetch(`${iss}/.well-known/smart-configuration`, {
            headers: {
              Accept: 'application/json',
            },
          });

          if (!wellKnownResponse.ok) {
            throw new Error('Failed to fetch SMART configuration');
          }

          const config = (await wellKnownResponse.json()) as SmartConfiguration;

          // Generate and store state for verification
          const state = crypto.randomUUID();
          sessionStorage.setItem('smart_state', state);

          // Redirect to authorization endpoint
          const authParams = new URLSearchParams({
            response_type: 'code',
            client_id: 'your-client-id', // This should be registered with the EHR
            scope: FHIR_SCOPE,
            redirect_uri: window.location.origin + '/launch',
            state,
            aud: iss,
            launch, // Include the launch parameter from the EHR
          });

          const url = new URL(config.authorization_endpoint);
          url.search = authParams.toString();
          window.location.href = url.toString();
          return;
        }

        // If we get here, we're handling the authorization response
        const code = params.get('code');
        const state = params.get('state');
        const storedState = sessionStorage.getItem('smart_state');

        const missing = [];
        if (!code) {
          missing.push('code');
        }
        if (!state) {
          missing.push('state');
        }

        if (missing.length > 0) {
          throw new Error(`Missing required parameters in authorization response: ${missing.join(', ')}`);
        }

        // Verify state parameter
        if (state !== storedState) {
          throw new Error('State parameter mismatch - possible security issue');
        }

        // Get the token endpoint from the issuer we originally requested authorization from
        const iss = sessionStorage.getItem('smart_iss');
        if (!iss) {
          throw new Error('No issuer found in session storage');
        }

        // Get the token endpoint from SMART configuration
        const wellKnownResponse = await fetch(`${iss}/.well-known/smart-configuration`, {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!wellKnownResponse.ok) {
          throw new Error('Failed to fetch SMART configuration');
        }

        const config = (await wellKnownResponse.json()) as SmartConfiguration;

        // Exchange the authorization code for an access token
        const tokenResponse = await fetch(config.token_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code as string, // We've already checked that code is not null
            redirect_uri: window.location.origin + '/launch',
            client_id: 'your-client-id',
          }).toString(),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to get access token');
        }

        const tokenData = await tokenResponse.json();

        // Clean up session storage
        sessionStorage.removeItem('smart_state');
        sessionStorage.removeItem('smart_iss');

        // Store the access token and other relevant data
        sessionStorage.setItem('smart_patient', tokenData.patient);

        // After getting the token
        medplumContext.medplum = new MedplumClient({
          baseUrl: iss,
          fhirUrlPath: '',
          accessToken: tokenData.access_token,
        });

        // Redirect to patient page
        navigate('/patient');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    handleSmartLaunch().catch((err) => {
      setError(err instanceof Error ? err.message : 'Unknown error');
    });
  }, [navigate, medplumContext]);

  if (error) {
    return (
      <Container>
        <Text ta="center" c="red" mt="xl">
          Error: {error}
        </Text>
      </Container>
    );
  }

  return (
    <Container>
      <Text ta="center" mt="xl">
        Launching SMART on FHIR app...
      </Text>
      <Loader size="xl" mt="xl" />
    </Container>
  );
}
