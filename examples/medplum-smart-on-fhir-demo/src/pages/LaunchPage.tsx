import { Container, Loader, Text } from '@mantine/core';
import { MedplumClient } from '@medplum/core';
import { useMedplumContext } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FHIR_SCOPE, MEDPLUM_CLIENT_ID, SMART_HEALTH_IT_CLIENT_ID } from '../config';

interface SmartConfiguration {
  authorization_endpoint: string;
  token_endpoint: string;
}

interface TokenResponse {
  access_token: string;
  patient: string;
}

function getClientId(params: URLSearchParams, iss: string): string {
  // First try to get from URL params
  const clientId = params.get('client_id');
  if (clientId) {
    return clientId;
  }

  // Otherwise determine based on issuer domain
  const issuerUrl = new URL(iss);
  const allowedHosts = ['smarthealthit.org'];
  if (allowedHosts.includes(issuerUrl.hostname)) {
    return SMART_HEALTH_IT_CLIENT_ID;
  }

  // Default to Medplum client ID
  return MEDPLUM_CLIENT_ID;
}

async function fetchSmartConfiguration(iss: string): Promise<SmartConfiguration> {
  const response = await fetch(`${iss}/.well-known/smart-configuration`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch SMART configuration');
  }

  return response.json();
}

async function initiateEhrLaunch(params: URLSearchParams): Promise<never> {
  const iss = params.get('iss');
  const launch = params.get('launch');

  if (!iss) {
    throw new Error('Missing iss parameter for EHR launch');
  }

  // Store the issuer for later use
  sessionStorage.setItem('smart_iss', iss);

  const config = await fetchSmartConfiguration(iss);

  // Generate and store state for verification
  const state = crypto.randomUUID();
  sessionStorage.setItem('smart_state', state);

  // Get the appropriate client ID
  const clientId = getClientId(params, iss);

  // Redirect to authorization endpoint
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: FHIR_SCOPE,
    redirect_uri: window.location.origin + '/launch',
    state,
    aud: iss,
    launch: launch as string,
    prompt: 'none',
  });

  const url = new URL(config.authorization_endpoint);
  url.search = authParams.toString();
  window.location.href = url.toString();
  return new Promise(() => {}); // This promise never resolves due to redirect
}

function validateAuthResponse(params: URLSearchParams): void {
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

  if (state !== storedState) {
    throw new Error('State parameter mismatch - possible security issue');
  }
}

async function exchangeCodeForToken(
  params: URLSearchParams,
  config: SmartConfiguration,
  clientId: string
): Promise<TokenResponse> {
  const code = params.get('code');
  const tokenResponse = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: window.location.origin + '/launch',
      client_id: clientId,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get access token');
  }

  return tokenResponse.json();
}

function setupMedplumClient(tokenData: TokenResponse, iss: string, medplumContext: { medplum: MedplumClient }): void {
  // Store the access token and other relevant data
  sessionStorage.setItem('smart_patient', tokenData.patient);

  // Configure the Medplum client
  medplumContext.medplum = new MedplumClient({
    baseUrl: iss,
    fhirUrlPath: '',
    accessToken: tokenData.access_token,
  });
}

export function LaunchPage(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const medplumContext = useMedplumContext();

  useEffect(() => {
    const handleSmartLaunch = async (): Promise<void> => {
      try {
        const params = new URLSearchParams(window.location.search);
        const launch = params.get('launch');

        if (launch) {
          await initiateEhrLaunch(params);
          return;
        }

        // Handle authorization response
        validateAuthResponse(params);

        const iss = sessionStorage.getItem('smart_iss');
        if (!iss) {
          throw new Error('No issuer found in session storage');
        }

        const config = await fetchSmartConfiguration(iss);
        const clientId = getClientId(params, iss);
        const tokenData = await exchangeCodeForToken(params, config, clientId);

        // Clean up session storage
        sessionStorage.removeItem('smart_state');
        sessionStorage.removeItem('smart_iss');

        setupMedplumClient(tokenData, iss, medplumContext);

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
