import { Divider, Group, Stack, Text, Tooltip, ActionIcon, Box } from '@mantine/core';
import { calculateAgeString, formatHumanName, resolveId } from '@medplum/core';
import {
  AllergyIntolerance,
  Appointment,
  Condition,
  Coverage,
  Encounter,
  HumanName,
  MedicationRequest,
  Observation,
  Patient,
  Reference,
  Resource,
  Immunization,
  Procedure,
  Device,
  Goal,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconStethoscope, IconCake, IconEmpathize, IconBinaryTree, IconMapPin, IconLanguage, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useState, useRef, JSX } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Contact } from './Contact';
import { Insurance } from './Insurance';
import { Medications } from './Medications';
import { ProblemList } from './ProblemList';
import { Vitals } from './Vitals';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import styles from './PatientSummary.module.css';

export interface PatientSummaryProps {
  readonly patient: Patient | Reference<Patient>;
  readonly background?: string;
  /** The URL that the upcoming appointments link should navigate to or `undefined` to not show the link. */
  readonly appointmentsUrl?: string;
  /** The URL that the documented visits (encounters) link should navigate to or `undefined` to not show the link. */
  readonly encountersUrl?: string;
  /** Callback when a resource is clicked in the list */
  readonly onClickResource?: (resource: Resource) => void;
}

interface PatientMedicalData {
  readonly allergies: AllergyIntolerance[];
  readonly problems: Condition[];
  readonly sexualOrientation?: Observation;
  readonly smokingStatus?: Observation;
  readonly vitals: Observation[];
  readonly medicationRequests: MedicationRequest[];
  readonly encounters?: Encounter[];
  readonly appointments?: Appointment[];
  readonly coverages?: Coverage[];
  readonly immunizations?: Immunization[];
  readonly procedures?: Procedure[];
  readonly devices?: Device[];
  readonly socialHistory: Observation[];
  readonly goals?: Goal[];
}

function getGenderIdentity(patient: Patient): string | undefined {
  const genderIdentityExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity'
  );
  return genderIdentityExt?.valueCodeableConcept?.coding?.[0]?.display;
}

function getBirthSex(patient: Patient): string | undefined {
  const birthSexExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'
  );
  return birthSexExt?.valueCode;
}

function getRace(patient: Patient): string | undefined {
  const raceExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'
  );
  return raceExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

function getEthnicity(patient: Patient): string | undefined {
  const ethnicityExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'
  );
  return ethnicityExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

const LANGUAGE_DISPLAY_MAP: Record<string, string> = {
  // Root language codes
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ko': 'Korean',
  'ru': 'Russian',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'bn': 'Bengali',
  'vi': 'Vietnamese',
  'th': 'Thai',
  'nl': 'Dutch',
  'pl': 'Polish',
  'tr': 'Turkish',
  'sv': 'Swedish',
  'da': 'Danish',
  'fi': 'Finnish',
  'no': 'Norwegian',
  'cs': 'Czech',
  'hu': 'Hungarian',
  'el': 'Greek',
  'he': 'Hebrew',
  'id': 'Indonesian',
  'ms': 'Malay',
  'ro': 'Romanian',
  'uk': 'Ukrainian',
  'hr': 'Croatian',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'et': 'Estonian',
  'lv': 'Latvian',
  'lt': 'Lithuanian',
  'bg': 'Bulgarian',
  'sr': 'Serbian',
  'is': 'Icelandic',
  'fa': 'Persian',
  'ur': 'Urdu',
  'ta': 'Tamil',
  'te': 'Telugu',
  'kn': 'Kannada',
  'ml': 'Malayalam',
  'si': 'Sinhala',
  'km': 'Khmer',
  'lo': 'Lao',
  'my': 'Burmese',
  'ka': 'Georgian',
  'hy': 'Armenian',
  'az': 'Azerbaijani',
  'uz': 'Uzbek',
  'kk': 'Kazakh',
  'ky': 'Kyrgyz',
  'tg': 'Tajik',
  'tk': 'Turkmen',
  'mn': 'Mongolian',
  'ne': 'Nepali',
  'ps': 'Pashto',
  'ku': 'Kurdish',
  'sd': 'Sindhi',
  'pa': 'Punjabi',
  'gu': 'Gujarati',
  'or': 'Odia',
  'as': 'Assamese',
  'mr': 'Marathi',
  'sa': 'Sanskrit',
  'bo': 'Tibetan',
  'dz': 'Dzongkha',
  'ti': 'Tigrinya',
  'am': 'Amharic',
  'so': 'Somali',
  'sw': 'Swahili',
  'yo': 'Yoruba',
  'ha': 'Hausa',
  'ig': 'Igbo',
  'zu': 'Zulu',
  'xh': 'Xhosa',
  'af': 'Afrikaans',
  'st': 'Sesotho',
  'tn': 'Tswana',
  'ss': 'Swati',
  've': 'Venda',
  'nr': 'Ndebele',
  'ts': 'Tsonga',
  'ny': 'Chichewa',
  'rw': 'Kinyarwanda',
  'mg': 'Malagasy',
  'sg': 'Sango',
  'ln': 'Lingala',
  'lu': 'Luba-Katanga',
  'lg': 'Ganda',
  'ak': 'Akan',
  'ee': 'Ewe',
  'ga': 'Irish',
  'gd': 'Scottish Gaelic',
  'cy': 'Welsh',
  'br': 'Breton',
  'oc': 'Occitan',
  'co': 'Corsican',
  'gv': 'Manx',
  'kw': 'Cornish',
  'fy': 'Western Frisian',
  'lb': 'Luxembourgish',
  'rm': 'Romansh',
  'wa': 'Walloon',
  'li': 'Limburgish',
  'nds': 'Low German',
  'dsb': 'Lower Sorbian',
  'hsb': 'Upper Sorbian',
  'fo': 'Faroese',
  'se': 'Northern Sami',
  'sm': 'Samoan',
  'to': 'Tongan',
  'fj': 'Fijian',
  'ty': 'Tahitian',
  'mi': 'Maori',
  'haw': 'Hawaiian',
  'chr': 'Cherokee',
  'iu': 'Inuktitut',
  'cr': 'Cree',
  'oj': 'Ojibwa',
  'kl': 'Kalaallisut',
  'ff': 'Fulah',
  'wo': 'Wolof',
  'sn': 'Shona',
  'ii': 'Sichuan Yi',
  'ug': 'Uighur',
  'za': 'Zhuang',
  'jv': 'Javanese',
  'su': 'Sundanese',
  'ceb': 'Cebuano',
  'ilo': 'Iloko',
  'hil': 'Hiligaynon',
  'war': 'Waray',
  'pam': 'Pampanga',
  'bik': 'Bikol',
  'pag': 'Pangasinan',
  'bcl': 'Central Bikol',
  'cbk': 'Chavacano',
  // Country/region specific codes
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  'en-CA': 'English (Canada)',
  'en-AU': 'English (Australia)',
  'en-NZ': 'English (New Zealand)',
  'es-ES': 'Spanish (Spain)',
  'es-MX': 'Spanish (Mexico)',
  'fr-FR': 'French (France)',
  'fr-CA': 'French (Canada)',
  'de-DE': 'German (Germany)',
  'it-IT': 'Italian (Italy)',
  'pt-BR': 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)',
  'zh-CN': 'Chinese (China)',
  'zh-TW': 'Chinese (Taiwan)',
  'ja-JP': 'Japanese (Japan)',
  'ko-KR': 'Korean (South Korea)',
  'ru-RU': 'Russian (Russia)',
  'ar-SA': 'Arabic (Saudi Arabia)',
  'hi-IN': 'Hindi (India)',
  'bn-IN': 'Bengali (India)',
  'vi-VN': 'Vietnamese (Vietnam)',
  'th-TH': 'Thai (Thailand)',
  'nl-NL': 'Dutch (Netherlands)',
  'pl-PL': 'Polish (Poland)',
  'tr-TR': 'Turkish (Turkey)',
  'sv-SE': 'Swedish (Sweden)',
  'da-DK': 'Danish (Denmark)',
  'fi-FI': 'Finnish (Finland)',
  'no-NO': 'Norwegian (Norway)',
  'cs-CZ': 'Czech (Czech Republic)',
  'hu-HU': 'Hungarian (Hungary)',
  'el-GR': 'Greek (Greece)',
  'he-IL': 'Hebrew (Israel)',
  'id-ID': 'Indonesian (Indonesia)',
  'ms-MY': 'Malay (Malaysia)',
  'ro-RO': 'Romanian (Romania)',
  'uk-UA': 'Ukrainian (Ukraine)',
  'hr-HR': 'Croatian (Croatia)',
  'sk-SK': 'Slovak (Slovakia)',
  'sl-SI': 'Slovenian (Slovenia)',
  'et-EE': 'Estonian (Estonia)',
  'lv-LV': 'Latvian (Latvia)',
  'lt-LT': 'Lithuanian (Lithuania)',
  'bg-BG': 'Bulgarian (Bulgaria)',
  'sr-RS': 'Serbian (Serbia)',
  'is-IS': 'Icelandic (Iceland)',
  'fa-IR': 'Persian (Iran)',
  'ur-PK': 'Urdu (Pakistan)',
  'ta-IN': 'Tamil (India)',
  'te-IN': 'Telugu (India)',
  'kn-IN': 'Kannada (India)',
  'ml-IN': 'Malayalam (India)',
  'si-LK': 'Sinhala (Sri Lanka)',
  'km-KH': 'Khmer (Cambodia)',
  'lo-LA': 'Lao (Laos)',
  'my-MM': 'Burmese (Myanmar)',
  'ka-GE': 'Georgian (Georgia)',
  'hy-AM': 'Armenian (Armenia)',
  'az-AZ': 'Azerbaijani (Azerbaijan)',
  'uz-UZ': 'Uzbek (Uzbekistan)',
  'kk-KZ': 'Kazakh (Kazakhstan)',
  'ky-KG': 'Kyrgyz (Kyrgyzstan)',
  'tg-TJ': 'Tajik (Tajikistan)',
  'tk-TM': 'Turkmen (Turkmenistan)',
  'mn-MN': 'Mongolian (Mongolia)',
  'ne-NP': 'Nepali (Nepal)',
  'ps-AF': 'Pashto (Afghanistan)',
  'ku-IQ': 'Kurdish (Iraq)',
  'sd-PK': 'Sindhi (Pakistan)',
  'pa-IN': 'Punjabi (India)',
  'gu-IN': 'Gujarati (India)',
  'or-IN': 'Odia (India)',
  'as-IN': 'Assamese (India)',
  'mr-IN': 'Marathi (India)',
  'sa-IN': 'Sanskrit (India)',
  'bo-CN': 'Tibetan (China)',
  'dz-BT': 'Dzongkha (Bhutan)',
  'ti-ET': 'Tigrinya (Ethiopia)',
  'am-ET': 'Amharic (Ethiopia)',
  'so-SO': 'Somali (Somalia)',
  'sw-KE': 'Swahili (Kenya)',
  'yo-NG': 'Yoruba (Nigeria)',
  'ha-NG': 'Hausa (Nigeria)',
  'ig-NG': 'Igbo (Nigeria)',
  'zu-ZA': 'Zulu (South Africa)',
  'xh-ZA': 'Xhosa (South Africa)',
  'af-ZA': 'Afrikaans (South Africa)',
  'st-ZA': 'Sesotho (South Africa)',
  'tn-ZA': 'Tswana (South Africa)',
  'ss-ZA': 'Swati (South Africa)',
  've-ZA': 'Venda (South Africa)',
  'nr-ZA': 'Ndebele (South Africa)',
  'ts-ZA': 'Tsonga (South Africa)',
  'ny-MW': 'Chichewa (Malawi)',
  'rw-RW': 'Kinyarwanda (Rwanda)',
  'mg-MG': 'Malagasy (Madagascar)',
  'sg-CF': 'Sango (Central African Republic)',
  'ln-CD': 'Lingala (Democratic Republic of the Congo)',
  'lu-CD': 'Luba-Katanga (Democratic Republic of the Congo)',
  'lg-UG': 'Ganda (Uganda)',
  'ak-GH': 'Akan (Ghana)',
  'ee-GH': 'Ewe (Ghana)',
  'ga-IE': 'Irish (Ireland)',
  'gd-GB': 'Scottish Gaelic (United Kingdom)',
  'cy-GB': 'Welsh (United Kingdom)',
  'br-FR': 'Breton (France)',
  'oc-FR': 'Occitan (France)',
  'co-FR': 'Corsican (France)',
  'gv-IM': 'Manx (Isle of Man)',
  'kw-GB': 'Cornish (United Kingdom)',
  'fy-NL': 'Western Frisian (Netherlands)',
  'lb-LU': 'Luxembourgish (Luxembourg)',
  'rm-CH': 'Romansh (Switzerland)',
  'wa-BE': 'Walloon (Belgium)',
  'li-NL': 'Limburgish (Netherlands)',
  'nds-DE': 'Low German (Germany)',
  'dsb-DE': 'Lower Sorbian (Germany)',
  'hsb-DE': 'Upper Sorbian (Germany)',
  'fo-FO': 'Faroese (Faroe Islands)',
  'se-NO': 'Northern Sami (Norway)',
  'sm-SM': 'Samoan (Samoa)',
  'to-TO': 'Tongan (Tonga)',
  'fj-FJ': 'Fijian (Fiji)',
  'ty-PF': 'Tahitian (French Polynesia)',
  'mi-NZ': 'Maori (New Zealand)',
  'haw-US': 'Hawaiian (United States)',
  'chr-US': 'Cherokee (United States)',
  'iu-CA': 'Inuktitut (Canada)',
  'cr-CA': 'Cree (Canada)',
  'oj-CA': 'Ojibwa (Canada)',
  'kl-GL': 'Kalaallisut (Greenland)',
  'ff-SN': 'Fulah (Senegal)',
  'wo-SN': 'Wolof (Senegal)',
  'sn-ZW': 'Shona (Zimbabwe)',
  'ii-CN': 'Sichuan Yi (China)',
  'ug-CN': 'Uighur (China)',
  'za-CN': 'Zhuang (China)',
  'jv-ID': 'Javanese (Indonesia)',
  'su-ID': 'Sundanese (Indonesia)',
  'ceb-PH': 'Cebuano (Philippines)',
  'ilo-PH': 'Iloko (Philippines)',
  'hil-PH': 'Hiligaynon (Philippines)',
  'war-PH': 'Waray (Philippines)',
  'pam-PH': 'Pampanga (Philippines)',
  'bik-PH': 'Bikol (Philippines)',
  'pag-PH': 'Pangasinan (Philippines)',
  'bcl-PH': 'Central Bikol (Philippines)',
  'cbk-PH': 'Chavacano (Philippines)'
};

function getLanguageDisplay(code: string): string {
  return LANGUAGE_DISPLAY_MAP[code] || code;
}

function formatLanguages(patient: Patient): { text: string; hasLanguages: boolean } {
  if (!patient.communication || patient.communication.length === 0) {
    return { text: 'Add Language', hasLanguages: false };
  }

  const languages = patient.communication
    .map(comm => {
      const code = comm.language?.coding?.[0]?.code;
      return code ? getLanguageDisplay(code) : undefined;
    })
    .filter((lang): lang is string => !!lang);

  if (languages.length === 0) {
    return { text: 'Add Language', hasLanguages: false };
  }

  // Sort languages - preferred first, then alphabetically
  const preferred = patient.communication
    .filter(comm => comm.preferred)
    .map(comm => {
      const code = comm.language?.coding?.[0]?.code;
      return code ? getLanguageDisplay(code) : undefined;
    })
    .filter((lang): lang is string => !!lang);

  const other = languages.filter(lang => !preferred.includes(lang)).sort();
  const allLanguages = [...preferred, ...other];

  return {
    text: allLanguages.join(' · '),
    hasLanguages: true
  };
}

function getGeneralPractitioner(patient: Patient): string | undefined {
  return patient.generalPractitioner?.[0]?.display;
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const {
    patient: propsPatient,
    onClickResource,
  } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();
  const [createdDate, setCreatedDate] = useState<string | undefined>();
  const patientId = resolveId(patient);
  const nameRef = useRef<HTMLDivElement>(null);
  const [isNameOverflowed, setIsNameOverflowed] = useState(false);

  useEffect(() => {
    const id = resolveId(propsPatient) as string;
    const ref = `Patient/${id}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };

    Promise.all([
      medplum.searchResources('AllergyIntolerance', { patient: ref, ...searchMeta }),
      medplum.searchResources('Condition', { patient: ref, ...searchMeta }),
      medplum.searchResources('MedicationRequest', { subject: ref, ...searchMeta }),
      medplum.searchResources('Observation', { subject: ref, ...searchMeta }),
      medplum.searchResources('Appointment', {
        patient: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Encounter', {
        subject: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Coverage', {
        beneficiary: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Immunization', {
        patient: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Procedure', {
        subject: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Device', {
        patient: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Goal', {
        subject: ref,
        ...searchMeta,
      }),
    ])
      .then((results) => {
        const observations = results[3];
        setMedicalData({
          allergies: results[0],
          problems: results[1],
          medicationRequests: results[2],
          sexualOrientation: observations.find((obs) => obs.code?.coding?.[0].code === '76690-7'),
          smokingStatus: observations.find((obs) => obs.code?.coding?.[0].code === '72166-2'),
          vitals: observations.filter((obs) => obs.category?.[0]?.coding?.[0].code === 'vital-signs'),
          appointments: results[4],
          encounters: results[5],
          coverages: results[6],
          immunizations: results[7],
          procedures: results[8],
          devices: results[9],
          goals: results[10],
          socialHistory: observations.filter((obs) =>
            obs.category?.some(cat => cat.coding?.some(coding => coding.code === 'social-history'))
          ),
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

  useEffect(() => {
    if (patient?.id) {
      medplum.readHistory('Patient', patient.id)
        .then((history) => {
          const firstEntry = history.entry?.[history.entry.length - 1];
          const lastUpdated = firstEntry?.resource?.meta?.lastUpdated;
          setCreatedDate(typeof lastUpdated === 'string' ? lastUpdated : '');
        })
        .catch(() => {});
    }
  }, [patient?.id, medplum]);

  useEffect(() => {
    const el = nameRef.current;
    if (el) {
      setIsNameOverflowed(el.scrollWidth > el.clientWidth);
    }
  }, [patient]);

  if (!patient) {
    return null;
  }

  return (
    <div style={{ height: '100%', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
      <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
        <div style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, padding: '16px 16px 0 16px', cursor: 'pointer', minWidth: 0 }} className={styles.patientSummaryListItem}>
          <Group align="center" gap="sm" mb={16} style={{ position: 'relative', minWidth: 0 }}>
            <ResourceAvatar value={patient} size={48} radius={48} style={{ border: '2px solid white' }} />
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Tooltip label={formatHumanName(patient.name?.[0] as HumanName)} position="top-start" openDelay={650} disabled={!isNameOverflowed}>
                <Text fz="h4" fw={800} truncate style={{ minWidth: 0 }} ref={nameRef}>
                  {formatHumanName(patient.name?.[0] as HumanName)}
                </Text>
              </Tooltip>
              {(() => {
                const dateString = typeof createdDate === 'string' && createdDate.length > 0 ? createdDate : undefined;
                if (!dateString) { return null; }
                const d = new Date(dateString);
                return (
                  <Text fz="xs" mt={-2} fw={500} c="gray.6" truncate style={{ minWidth: 0 }}>
                    Patient since {d.getMonth() + 1}/{d.getDate()}/{d.getFullYear()}
                  </Text>
                );
              })()}
            </Stack>
            <div className={styles.patientSummaryGradient} />
            <div className={styles.patientSummaryChevronContainer} style={{ alignItems: 'center' }}>
              <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                <IconChevronRight size={16} stroke={2.5} />
              </ActionIcon>
            </div>
          </Group>
          <Divider />
        </div>
      </MedplumLink>
      <Stack gap="xs" px={16} pt={12} pb={16} style={{ flex: 2, overflowY: 'auto', minHeight: 0 }}>
        {medicalData && (
          <>
            <Stack gap="xs" py={8}>
              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Birthdate & Age" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconCake size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0, color: patient.birthDate ? 'inherit' : 'var(--mantine-color-gray-6)' }}>
                        {patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: 'numeric'
                        }) + ' · ' + (() => {
                          const ageStr = calculateAgeString(patient.birthDate);
                          if (!ageStr) { return '0 years old'; }
                          const age = parseInt(ageStr, 10);
                          return `${isNaN(age) ? '0' : age} years old`;
                        })() : 'Add Birthdate'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Gender & Identity" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconEmpathize size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0, color: (patient.gender || getGenderIdentity(patient)) ? 'inherit' : 'var(--mantine-color-gray-6)' }}>
                        {patient.gender || getGenderIdentity(patient) ? 
                          `${patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : ''}${patient.gender && getGenderIdentity(patient) ? ' · ' : ''}${getGenderIdentity(patient) ? `${getGenderIdentity(patient)}` : ''}${getBirthSex(patient) ? ` · Born as ${getBirthSex(patient)}` : ''}` : 
                          'Add Gender & Identity'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Race & Ethnicity" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconBinaryTree size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0, color: (getRace(patient) || getEthnicity(patient)) ? 'inherit' : 'var(--mantine-color-gray-6)' }}>
                        {getRace(patient) || getEthnicity(patient) ? 
                          `${getRace(patient) || ''}${getRace(patient) && getEthnicity(patient) ? ' · ' : ''}${getEthnicity(patient) || ''}` : 
                          'Add Race & Ethnicity'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Location" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconMapPin size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0, color: (patient.address?.[0]?.city || patient.address?.[0]?.state) ? 'inherit' : 'var(--mantine-color-gray-6)' }}>
                        {patient.address?.[0]?.city || patient.address?.[0]?.state ? 
                          `${patient.address[0].city || ''}${patient.address[0].city && patient.address[0].state ? ', ' : ''}${patient.address[0].state || ''}` : 
                          'Add Location'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Language" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconLanguage size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0, color: formatLanguages(patient).hasLanguages ? 'inherit' : 'var(--mantine-color-gray-6)' }}>
                        {formatLanguages(patient).text}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="General Practitioner" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconStethoscope size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0, color: getGeneralPractitioner(patient) ? 'inherit' : 'var(--mantine-color-gray-6)' }}>
                        {getGeneralPractitioner(patient) || 'Add a General Practitioner'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>
            </Stack>
            <Divider />
            <Contact patient={patient} onClickResource={onClickResource} />
            <Divider />
            <Insurance coverages={medicalData.coverages || []} onClickResource={onClickResource} />
            <Divider />
            <Allergies patient={patient} allergies={medicalData.allergies} onClickResource={onClickResource} />
            <Divider />
            <ProblemList patient={patient} problems={medicalData.problems} onClickResource={onClickResource} />
            <Divider />
            <Medications
              patient={patient}
              medicationRequests={medicalData.medicationRequests}
              onClickResource={onClickResource}
            />
            <Divider />
            <Vitals patient={patient} vitals={medicalData.vitals} onClickResource={onClickResource} />
            <Divider />
          </>
        )}
      </Stack>
    </div>
  );
}

