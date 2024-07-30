import { normalizeErrorString } from '@medplum/core';
import { Address, ContactPoint, Patient } from '@medplum/fhirtypes';
import { PhotonAddress } from '../photon-types';

export function formatAWSDate(date?: string): string {
  if (!date) {
    return '1970-01-01';
  }

  return new Date(date).toISOString().slice(0, 10);
}

export function getSexType(sex?: Patient['gender']): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (sex === 'female') {
    return 'FEMALE';
  } else if (sex === 'male') {
    return 'MALE';
  } else {
    return 'UNKNOWN';
  }
}

export function getTelecom(system: ContactPoint['system'], person?: Patient): string | undefined {
  if (!person) {
    throw new Error('No patient provided');
  }

  const telecom = person.telecom?.find((comm) => comm.system === system);
  const telecomValue = telecom?.value;

  if (!telecomValue && system === 'phone') {
    throw new Error('Patient phone number is required to sync to Photon Health');
  }

  if (!telecomValue) {
    return undefined;
  }

  if (system === 'phone') {
    return telecomValue.slice(0, 1) === '+1' ? telecomValue : '+1' + telecomValue;
  } else {
    return telecomValue;
  }
}

export function formatPhotonAddress(address?: Address): PhotonAddress | undefined {
  if (!address) {
    return undefined;
  }

  return {
    street1: address.line?.[0] ?? '',
    street2: address.line?.[1] ?? '',
    city: address.city ?? '',
    state: address.state ?? '',
    country: address.country ?? '',
    postalCode: address.postalCode ?? '',
  };
}

export async function handlePhotonAuth(clientId?: string, clientSecret?: string): Promise<string> {
  if (!clientId || !clientSecret) {
    throw new Error('Unable to authenticate. Invalid client ID or secret.');
  }

  const body = {
    client_id: clientId,
    client_secret: clientSecret,
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
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as any;
    return result.access_token as string;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}
