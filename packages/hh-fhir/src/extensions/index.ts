const BASE = 'https://homehealth.com.br/fhir/StructureDefinition';

export const HH_EXT = {
  // Patient
  CPF: `${BASE}/cpf`,
  CNS: 'https://rnds.saude.gov.br/fhir/r4/StructureDefinition/CNS',

  // Practitioner credentials
  CREFITO: `${BASE}/crefito`,
  CRP: `${BASE}/crp`,
  CRN: `${BASE}/crn`,
  CFO: `${BASE}/cfo`,

  // Appointment
  HOME_VISIT: `${BASE}/home-visit`,
  HOME_VISIT_ADDRESS: `${BASE}/home-visit-address`,

  // SOAP note (on ClinicalImpression)
  SOAP_S: `${BASE}/soap-s`,
  SOAP_O: `${BASE}/soap-o`,
  SOAP_A: `${BASE}/soap-a`,
  SOAP_P: `${BASE}/soap-p`,

  // Tenant / SaaS
  PROJECT_ID: `${BASE}/project-id`,
  SUBSCRIPTION_PLAN: `${BASE}/subscription-plan`,
  SUBSCRIPTION_STATUS: `${BASE}/subscription-status`,
  USER_ROLE: `${BASE}/user-role`,
} as const;

export type HHExtKey = keyof typeof HH_EXT;

export function getExtension(
  resource: { extension?: Array<{ url: string; valueString?: string }> },
  key: HHExtKey
): string | undefined {
  return resource.extension?.find((e) => e.url === HH_EXT[key])?.valueString;
}

export function setExtension(
  extensions: Array<{ url: string; valueString?: string }>,
  key: HHExtKey,
  value: string
): void {
  const existing = extensions.find((e) => e.url === HH_EXT[key]);
  if (existing) {
    existing.valueString = value;
  } else {
    extensions.push({ url: HH_EXT[key], valueString: value });
  }
}
