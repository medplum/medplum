// Common terminology systems, taken from https://terminology.hl7.org/external_terminologies.html
export const UCUM = 'http://unitsofmeasure.org';
export const LOINC = 'http://loinc.org';
export const SNOMED = 'http://snomed.info/sct';
export const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
export const CPT = 'http://www.ama-assn.org/go/cpt';
export const ICD10 = 'http://hl7.org/fhir/sid/icd-10';

// common http-based origins useful for avoiding false-positives about preferring https over http,
// e.g. https://rules.sonarsource.com/javascript/type/Security%20Hotspot/RSPEC-5332/
export const HTTP_HL7_ORG = 'http://hl7.org';
export const HTTP_TERMINOLOGY_HL7_ORG = 'http://terminology.hl7.org';
