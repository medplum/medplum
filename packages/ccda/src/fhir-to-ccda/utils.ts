// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { capitalize, getExtension } from '@medplum/core';
import {
  Address,
  ContactPoint,
  Extension,
  HumanName,
  Identifier,
  Narrative,
  Patient,
  Period,
} from '@medplum/fhirtypes';
import { mapFhirToCcdaDate, mapFhirToCcdaDateTime } from '../datetime';
import { OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM, OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM } from '../oids';
import {
  ADDRESS_USE_MAPPER,
  CCDA_NARRATIVE_REFERENCE_URL,
  GENDER_MAPPER,
  HUMAN_NAME_USE_MAPPER,
  mapFhirSystemToCcda,
  TELECOM_USE_MAPPER,
  US_CORE_ETHNICITY_URL,
  US_CORE_RACE_URL,
} from '../systems';
import {
  CcdaAddr,
  CcdaCode,
  CcdaEffectiveTime,
  CcdaId,
  CcdaLanguageCommunication,
  CcdaName,
  CcdaNarrative,
  CcdaPatient,
  CcdaReference,
  CcdaTelecom,
  CcdaText,
  CcdaTimeStamp,
} from '../types';
import { parseXml } from '../xml';

/**
 * Map the patient to the C-CDA patient.
 * @param patient - The patient to map.
 * @returns The C-CDA patient.
 */
export function mapPatient(patient: Patient): CcdaPatient {
  return {
    name: mapNames(patient.name),
    administrativeGenderCode: mapGender(patient.gender),
    birthTime: mapBirthDate(patient.birthDate),
    raceCode: mapRace(patient),
    'sdtc:raceCode': mapDetailedRace(patient),
    ethnicGroupCode: mapEthnicity(patient.extension),
    languageCommunication: mapLanguageCommunication(patient.communication),
  };
}

/**
 * Map the names to the C-CDA names.
 * @param names - The names to map.
 * @returns The C-CDA names.
 */
export function mapNames(names: HumanName[] | undefined): CcdaName[] | undefined {
  return names?.map((name) => ({
    '@_use': name.use ? HUMAN_NAME_USE_MAPPER.mapFhirToCcdaWithDefault(name.use, 'L') : undefined,
    prefix: name.prefix,
    family: name.family,
    given: name.given,
    suffix: name.suffix,
  }));
}

/**
 * Map the gender to the C-CDA gender.
 * @param gender - The gender to map.
 * @returns The C-CDA gender.
 */

export function mapGender(gender: Patient['gender']): CcdaCode | undefined {
  if (!gender) {
    return undefined;
  }
  return {
    '@_code': GENDER_MAPPER.mapFhirToCcda(gender),
    '@_displayName': gender ? capitalize(gender) : 'Unknown',
    '@_codeSystem': OID_ADMINISTRATIVE_GENDER_CODE_SYSTEM,
    '@_codeSystemName': 'AdministrativeGender',
  };
}

/**
 * Map the birth date to the C-CDA birth date.
 * @param birthDate - The birth date to map.
 * @returns The C-CDA birth date.
 */
export function mapBirthDate(birthDate: string | undefined): CcdaTimeStamp | undefined {
  if (!birthDate) {
    return undefined;
  }
  return {
    '@_value': birthDate.replace(/-/g, ''),
  };
}

/**
 * Map the FHIR telecom to the C-CDA telecom.
 * @param contactPoints - The contact points to map.
 * @returns The C-CDA telecom.
 */
export function mapTelecom(contactPoints: ContactPoint[] | undefined): CcdaTelecom[] {
  if (!contactPoints || contactPoints.length === 0) {
    return [{ '@_nullFlavor': 'UNK' }];
  }
  return contactPoints?.map((cp) => ({
    '@_use': cp.use ? TELECOM_USE_MAPPER.mapFhirToCcda(cp.use as 'home' | 'work' | 'mobile') : undefined,
    '@_value': `${mapTelecomSystemToPrefix(cp.system)}${cp.value}`,
  }));
}

/**
 * Map the FHIR telecom system to the C-CDA telecom system.
 * @param system - The system to map.
 * @returns The C-CDA telecom system.
 */
export function mapTelecomSystemToPrefix(system: string | undefined): string {
  if (system === 'email') {
    return 'mailto:';
  }
  if (system === 'phone') {
    return 'tel:';
  }
  if (system === 'fax') {
    return 'fax:';
  }
  return '';
}

/**
 * Map the addresses to the C-CDA addresses.
 * @param addresses - The addresses to map.
 * @returns The C-CDA addresses.
 */
export function mapFhirAddressArrayToCcdaAddressArray(addresses: Address[] | undefined): CcdaAddr[] {
  if (!addresses || addresses.length === 0) {
    return [{ '@_nullFlavor': 'UNK' }];
  }
  return addresses.map((addr) => mapFhirAddressToCcdaAddress(addr)).filter(Boolean) as CcdaAddr[];
}

export function mapFhirAddressToCcdaAddress(address: Address | undefined): CcdaAddr | undefined {
  if (!address) {
    return undefined;
  }
  const result: CcdaAddr = {
    '@_use': address.use ? ADDRESS_USE_MAPPER.mapFhirToCcda(address.use as 'home' | 'work') : undefined,
    streetAddressLine: address.line || [],
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };

  return result;
}

/**
 * Map the race to the C-CDA race.
 * @param patient - The patient to map.
 * @returns The C-CDA race.
 */
export function mapRace(patient: Patient): CcdaCode[] | undefined {
  const ombCategory = getExtension(patient, US_CORE_RACE_URL, 'ombCategory')?.valueCoding;
  if (!ombCategory) {
    return [
      {
        '@_nullFlavor': 'UNK',
      },
    ];
  }

  return [
    {
      '@_code': ombCategory.code,
      '@_displayName': ombCategory.display,
      '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
      '@_codeSystemName': 'CDC Race and Ethnicity',
    },
  ];
}

/**
 * Map the race to the C-CDA race.
 * @param patient - The patient to map.
 * @returns The C-CDA race.
 */
export function mapDetailedRace(patient: Patient): CcdaCode[] | undefined {
  const detailed = getExtension(patient, US_CORE_RACE_URL, 'detailed')?.valueCoding;
  if (!detailed) {
    return undefined;
  }

  return [
    {
      '@_code': detailed.code,
      '@_displayName': detailed.display,
      '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
      '@_codeSystemName': 'CDC Race and Ethnicity',
    },
  ];
}

/**
 * Map the ethnicity to the C-CDA ethnicity.
 * @param extensions - The extensions to map.
 * @returns The C-CDA ethnicity.
 */
export function mapEthnicity(extensions: Extension[] | undefined): CcdaCode[] | undefined {
  const ethnicityExt = extensions?.find((e) => e.url === US_CORE_ETHNICITY_URL);
  const ombCategory = ethnicityExt?.extension?.find((e) => e.url === 'ombCategory')?.valueCoding;

  if (!ombCategory) {
    return [
      {
        '@_nullFlavor': 'UNK',
      },
    ];
  }

  return [
    {
      '@_code': ombCategory.code,
      '@_displayName': ombCategory.display,
      '@_codeSystem': OID_CDC_RACE_AND_ETHNICITY_CODE_SYSTEM,
      '@_codeSystemName': 'CDC Race and Ethnicity',
    },
  ];
}

/**
 * Map the language communication to the C-CDA language communication.
 * @param communication - The communication to map.
 * @returns The C-CDA language communication.
 */
export function mapLanguageCommunication(
  communication: Patient['communication']
): CcdaLanguageCommunication[] | undefined {
  if (!communication?.length) {
    return undefined;
  }

  return [
    {
      languageCode: { '@_code': communication[0].language?.coding?.[0]?.code },
    },
  ];
}

/**
 * Map the FHIR identifiers to the C-CDA identifiers.
 * @param id - The FHIR resource ID
 * @param identifiers - The FHIR identifiers to map.
 * @returns The C-CDA identifiers.
 */
export function mapIdentifiers(id: string | undefined, identifiers: Identifier[] | undefined): CcdaId[] | undefined {
  const result: CcdaId[] = [];

  if (id) {
    result.push({ '@_root': id });
  }

  if (identifiers) {
    for (const id of identifiers) {
      const root = mapFhirSystemToCcda(id.system);
      if (!root) {
        continue;
      }
      result.push({ '@_root': root, '@_extension': id.value });
    }
  }

  return result;
}

export function mapEffectiveTime(
  dateTime: string | undefined,
  period: Period | undefined
): CcdaEffectiveTime[] | undefined {
  if (period) {
    return [
      {
        low: { '@_value': mapFhirToCcdaDateTime(period.start) },
        high: { '@_value': mapFhirToCcdaDateTime(period.end) },
      },
    ];
  }
  if (dateTime) {
    return [
      {
        '@_value': mapFhirToCcdaDateTime(dateTime),
      },
    ];
  }
  return undefined;
}

export function mapEffectiveDate(
  dateTime: string | undefined,
  period: Period | undefined
): CcdaEffectiveTime[] | undefined {
  if (period) {
    return [
      {
        '@_xsi:type': 'IVL_TS',
        low: period.start ? { '@_value': mapFhirToCcdaDate(period.start) } : undefined,
        high: period.end ? { '@_value': mapFhirToCcdaDate(period.end) } : undefined,
      },
    ];
  }
  if (dateTime) {
    return [
      {
        '@_value': mapFhirToCcdaDate(dateTime),
      },
    ];
  }
  return undefined;
}

export function mapEffectivePeriod(
  start: string | undefined,
  end: string | undefined,
  useNullFlavor = false
): CcdaEffectiveTime[] | undefined {
  if (!start && !end) {
    return undefined;
  }

  const result: CcdaEffectiveTime = {};

  if (start) {
    result['low'] = { '@_value': mapFhirToCcdaDateTime(start) };
  } else if (useNullFlavor) {
    result['low'] = { '@_nullFlavor': 'NI' };
  }

  if (end) {
    result['high'] = { '@_value': mapFhirToCcdaDateTime(end) };
  } else if (useNullFlavor) {
    result['high'] = { '@_nullFlavor': 'NI' };
  }

  return [result];
}

/**
 * Get the narrative reference from the FHIR extensions.
 * @param extensions - The extensions to get the narrative reference from.
 * @returns The C-CDA narrative reference.
 */
export function getNarrativeReference(extensions: Extension[] | undefined): CcdaReference | undefined {
  const ref = extensions?.find((e) => e.url === CCDA_NARRATIVE_REFERENCE_URL)?.valueString;
  return ref ? { '@_value': ref } : undefined;
}

/**
 * Create the C-CDA observation text for the FHIR observation.
 * @param extensions - The extensions to create the C-CDA observation text for.
 * @returns The C-CDA observation text.
 */
export function createTextFromExtensions(extensions: Extension[] | undefined): CcdaText | undefined {
  const ref = getNarrativeReference(extensions);
  return ref ? { reference: ref } : undefined;
}

export function mapFhirTextDivToCcdaSectionText(text: Narrative | undefined): CcdaNarrative | undefined {
  if (!text) {
    return undefined;
  }

  const result = parseXml(text.div)?.div;

  if (result?.['@_xmlns']) {
    delete result['@_xmlns'];
  }

  return result;
}
