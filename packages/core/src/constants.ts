// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Common terminology systems, taken from https://terminology.hl7.org/external_terminologies.html
export const UCUM = 'http://unitsofmeasure.org';
export const LOINC = 'http://loinc.org';
export const SNOMED = 'http://snomed.info/sct';
export const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
export const CPT = 'http://www.ama-assn.org/go/cpt';
export const ICD10 = 'http://hl7.org/fhir/sid/icd-10';
export const NDC = 'http://hl7.org/fhir/sid/ndc';

// HL7 v3 ObservationInterpretation code system, used for Observation.interpretation
// (e.g. "H" = high, "L" = low, "HH" = critically high). See
// https://terminology.hl7.org/CodeSystem-v3-ObservationInterpretation.html
export const OBSERVATION_INTERPRETATION =
  'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

// common http-based origins useful for avoiding false-positives about preferring https over http,
// e.g. https://rules.sonarsource.com/javascript/type/Security%20Hotspot/RSPEC-5332/
export const HTTP_HL7_ORG = 'http://hl7.org';
export const HTTP_TERMINOLOGY_HL7_ORG = 'http://terminology.hl7.org';
