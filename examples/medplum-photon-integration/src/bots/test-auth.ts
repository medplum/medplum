import { BotEvent, allOk, normalizeErrorString, MedplumClient } from '@medplum/core';

export async function handler(_medplum: MedplumClient, event: BotEvent): Promise<any> {
  const CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString as string;
  const CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString as string;

  const body = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    audience: 'https://api.neutron.health',
    grant_type: 'client_credentials',
  };

  try {
    const response = await fetch('https://auth.neutron.health/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}, ${response.statusText}`);
    }

    return allOk;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}
