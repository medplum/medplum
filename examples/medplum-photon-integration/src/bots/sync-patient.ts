import { BotEvent, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Address, ContactPoint, Patient } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

interface CreatePatientVariables {
  externalId: string;
  name: PhotonName;
  dateOfBirth: string;
  sex: 'MALE' | 'FEMALE' | 'UNKNOWN';
  gender?: string;
  email?: string;
  phone?: string;
  address?: PhotonAddress;
}

interface PhotonName {
  first: string;
  last: string;
  title?: string;
  middle?: string;
}

interface PhotonAddress {
  name?: PhotonName;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export async function handler(_medplum: MedplumClient, event: BotEvent<Patient>): Promise<string> {
  const patient = event.input;
  const CLIENT_ID = event.secrets['PHOTON_CLIENT_ID']?.valueString;
  const CLIENT_SECRET = event.secrets['PHOTON_CLIENT_SECRET']?.valueString;

  const PHOTON_AUTH_TOKEN = await handlePhotonAuth(CLIENT_ID, CLIENT_SECRET);

  const query = `
    mutation createPatient(
      $externalId: ID
      $name: NameInput!
      $dateOfBirth: AWSDate!
      $sex: SexType!
      $gender: String
      $email: AWSEmail
      $phone: AWSPhone!
      $address: AddressInput
    ) {
      createPatient(
        externalId: $externalId
        name: $name
        dateOfBirth: $dateOfBirth
        sex: $sex
        gender: $gender
        email: $email
        phone: $phone
        address: $address
      ) { id }
    }
  `;

  if (!patient.birthDate) {
    throw new Error('Patient birth date is required to sync to Photon Health');
  }

  if (!patient.name) {
    throw new Error('Patient name is required to sync to Photon Health');
  }

  const variables: CreatePatientVariables = {
    externalId: patient.id as string,
    name: {
      first: patient.name?.[0].given?.[0] ?? '',
      last: patient.name?.[0].family ?? '',
    },
    dateOfBirth: formatAWSDate(patient.birthDate),
    sex: getSexType(patient.gender),
    gender: patient.gender ?? 'unknown',
    phone: getTelecom('phone', patient),
  };

  const email = getTelecom('email', patient);
  const address = formatPhotonAddress(patient.address?.[0]);

  if (email) {
    variables.email = email;
  }

  if (address) {
    variables.address = address;
  }

  const body = JSON.stringify({ query, variables });

  try {
    const response = await fetch('https://api.neutron.health/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + PHOTON_AUTH_TOKEN,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const patient = result.data.createPatient;
    return patient.id;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

async function handlePhotonAuth(clientId?: string, clientSecret?: string): Promise<string> {
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

    const result = await response.json();
    return result.access_token;
  } catch (err) {
    throw new Error(normalizeErrorString(err));
  }
}

function formatAWSDate(date?: string): string {
  if (!date) {
    return '1970-01-01';
  }

  return new Date(date).toISOString().slice(0, 10);
}

function getSexType(sex?: Patient['gender']): 'MALE' | 'FEMALE' | 'UNKNOWN' {
  if (sex === 'female') {
    return 'FEMALE';
  } else if (sex === 'male') {
    return 'MALE';
  } else {
    return 'UNKNOWN';
  }
}

function getTelecom(system: ContactPoint['system'], person?: Patient): string | undefined {
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

function formatPhotonAddress(address?: Address): PhotonAddress | undefined {
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
