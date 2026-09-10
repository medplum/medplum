// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import patientIntakeQuestionnaireData from './patient-intake-questionnaire-full-sdc.json';

const templateExtractUrl = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract';
const allocateIdUrl = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId';

const questionnaire = (patientIntakeQuestionnaireData as Bundle).entry?.[0]?.resource as Questionnaire;

function findItem(
  linkId: string,
  items: QuestionnaireItem[] | undefined = questionnaire.item
): QuestionnaireItem | undefined {
  for (const item of items ?? []) {
    if (item.linkId === linkId) {
      return item;
    }
    const nested = findItem(linkId, item.item ?? []);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function getAllItems(items: QuestionnaireItem[] | undefined = questionnaire.item): QuestionnaireItem[] {
  return (items ?? []).flatMap((item) => [item, ...getAllItems(item.item ?? [])]);
}

function getTemplateReference(item: QuestionnaireItem): string | undefined {
  const extractExtension = item.extension?.find((extension) => extension.url === templateExtractUrl);
  return extractExtension?.extension?.find((extension) => extension.url === 'template')?.valueReference?.reference;
}

describe('Patient Intake SDC Questionnaire', () => {
  test('contains the expected questionnaire and allocation metadata', () => {
    expect(questionnaire).toMatchObject({
      resourceType: 'Questionnaire',
      status: 'active',
      title: 'Patient Intake Questionnaire (Full SDC)',
      name: 'patient-intake-full-sdc',
      url: 'https://medplum.com/Questionnaire/patient-intake-full-sdc',
    });
    expect(questionnaire.contained).toHaveLength(21);
    expect(questionnaire.extension).toContainEqual({ url: allocateIdUrl, valueString: 'NewPatientId' });
  });

  test('contains one template for every resource type used by the intake form', () => {
    const expectedTemplates: Record<string, string> = {
      'tmpl-patient': 'Patient',
      'tmpl-sexual-orientation': 'Observation',
      'tmpl-housing-status': 'Observation',
      'tmpl-education-level': 'Observation',
      'tmpl-smoking-status': 'Observation',
      'tmpl-pregnancy-status': 'Observation',
      'tmpl-estimated-delivery-date': 'Observation',
      'tmpl-allergy': 'AllergyIntolerance',
      'tmpl-medication': 'MedicationRequest',
      'tmpl-condition': 'Condition',
      'tmpl-family-history': 'FamilyMemberHistory',
      'tmpl-immunization': 'Immunization',
      'tmpl-coverage': 'Coverage',
      'tmpl-care-team': 'CareTeam',
      'tmpl-consent-medical-treatment': 'Consent',
      'tmpl-consent-agreement-to-pay': 'Consent',
      'tmpl-consent-privacy-practices': 'Consent',
      'tmpl-consent-advance-directives': 'Consent',
      'tmpl-consent-communication-email-appointment-reminders': 'Consent',
      'tmpl-consent-communication-call-or-text-appointment-reminders': 'Consent',
      'tmpl-consent-communication-voice-text-appointment-reminders': 'Consent',
    };

    for (const [id, resourceType] of Object.entries(expectedTemplates)) {
      expect(questionnaire.contained?.find((resource) => resource.id === id)).toMatchObject({ resourceType, id });
    }
  });

  test('links extraction items to contained templates', () => {
    const templates = new Set((questionnaire.contained ?? []).map((resource) => `#${resource.id}`));
    const extractionItems = getAllItems().filter((item) =>
      item.extension?.some((ext) => ext.url === templateExtractUrl)
    );

    expect(extractionItems.length).toBeGreaterThan(0);
    for (const item of extractionItems) {
      expect(templates).toContain(getTemplateReference(item));
    }
  });

  test('uses SDC value and context extensions for FHIRPath mappings', () => {
    const serialized = JSON.stringify(questionnaire);

    expect(serialized).toContain('sdc-questionnaire-templateExtractValue');
    expect(serialized).toContain('sdc-questionnaire-templateExtractContext');
    expect(serialized).toContain("item.where(linkId='last-name').answer.valueString.first()");
    expect(serialized).toContain("item.where(linkId='allergy-substance').answer.valueCoding");
  });

  test.each([
    ['patient-demographics', '#tmpl-patient'],
    ['allergies', '#tmpl-allergy'],
    ['medications', '#tmpl-medication'],
    ['coverage-information', '#tmpl-coverage'],
    ['consent-for-treatment', '#tmpl-consent-medical-treatment'],
  ])('%s maps to %s', (linkId, expectedReference) => {
    expect(getTemplateReference(findItem(linkId) as QuestionnaireItem)).toBe(expectedReference);
  });
});
