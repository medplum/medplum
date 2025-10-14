// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, test, expect } from 'vitest';
import type { Questionnaire, QuestionnaireItem, Resource } from '@medplum/fhirtypes';
import patientIntakeQuestionnaire from './patient-intake-questionnaire-full-sdc.json';

describe('Patient Intake Questionnaire', () => {
  const questionnaire = (patientIntakeQuestionnaire as any).entry[0].resource as Questionnaire;
  const questionnaireJson = JSON.stringify(questionnaire);
  const SDC_TEMPLATE_EXTRACT = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract';

  // Helpers
  const findItem = (linkId: string, items = questionnaire.item): QuestionnaireItem | undefined => {
    for (const item of items || []) {
      if (item.linkId === linkId) {
        return item;
      }
      const found = item.item && findItem(linkId, item.item);
      if (found) {
        return found;
      }
    }
    return undefined;
  };

  const findTemplate = (id: string): Resource | undefined => questionnaire.contained?.find(r => r.id === id);

  const getTemplateRef = (linkId: string): string | undefined => {
    const item = findItem(linkId);
    const extractExt = item?.extension?.find(e => e.url === SDC_TEMPLATE_EXTRACT) as any;
    return extractExt?.extension?.find((e: any) => e.url === 'template')?.valueReference?.reference;
  };

  test('has correct basic structure', () => {
    expect(questionnaire).toMatchObject({
      resourceType: 'Questionnaire',
      status: 'active',
      title: 'Patient Intake Questionnaire (Full SDC)',
      url: 'https://medplum.com/Questionnaire/patient-intake-full-sdc',
      name: 'patient-intake-full-sdc'
    });
    
    expect(questionnaire.contained).toHaveLength(21);
    
    const extractAllocateExt = questionnaire.extension?.find(e => e.url.includes('extractAllocateId'));
    expect(extractAllocateExt?.valueString).toBe('NewPatientId');
  });

  test.each([
    ['tmpl-patient', 'Patient'],
    ['tmpl-sexual-orientation', 'Observation'],
    ['tmpl-housing-status', 'Observation'],
    ['tmpl-education-level', 'Observation'],
    ['tmpl-smoking-status', 'Observation'],
    ['tmpl-pregnancy-status', 'Observation'],
    ['tmpl-estimated-delivery-date', 'Observation'],
    ['tmpl-allergy', 'AllergyIntolerance'],
    ['tmpl-medication', 'MedicationRequest'],
    ['tmpl-condition', 'Condition'],
    ['tmpl-family-history', 'FamilyMemberHistory'],
    ['tmpl-immunization', 'Immunization'],
    ['tmpl-coverage', 'Coverage'],
    ['tmpl-care-team', 'CareTeam'],
    ['tmpl-consent-medical-treatment', 'Consent'],
    ['tmpl-consent-agreement-to-pay', 'Consent'],
    ['tmpl-consent-privacy-practices', 'Consent'],
    ['tmpl-consent-advance-directives', 'Consent'],
    ['tmpl-consent-communication-email-appointment-reminders', 'Consent'],
    ['tmpl-consent-communication-call-or-text-appointment-reminders', 'Consent'],
    ['tmpl-consent-communication-voice-text-appointment-reminders', 'Consent']
  ])('has %s template with type %s', (templateId, resourceType) => {
    expect(findTemplate(templateId)?.resourceType).toBe(resourceType);
  });

  test('patient template has US Core profile and extensions', () => {
    const patientTemplate = findTemplate('tmpl-patient') as any;
    
    expect(patientTemplate?.meta?.profile).toContain(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'
    );
    
    const hasRaceExtension = patientTemplate?.extension?.some((e: any) => 
      e.url.includes('us-core-race')
    );
    const hasEthnicityExtension = patientTemplate?.extension?.some((e: any) => 
      e.url.includes('us-core-ethnicity')
    );
    
    expect(hasRaceExtension).toBe(true);
    expect(hasEthnicityExtension).toBe(true);
  });

  test.each([
    ['patient-demographics', '#tmpl-patient'],
    ['allergies', '#tmpl-allergy'],
    ['medications', '#tmpl-medication']
  ])('%s item links to %s template', (linkId, templateRef) => {
    expect(getTemplateRef(linkId)).toBe(templateRef);
  });

  test('contains valid FHIRPath expressions', () => {
    const expectedPatterns = [
      '%resource.item.where(linkId=',
      '.answer.valueString.first()',
      '.answer.valueCoding',
      'sdc-questionnaire-templateExtractContext',
      "item.where(linkId='last-name').answer.valueString.first()",
      "item.where(linkId='street').answer.valueString.first()",
      "item.where(linkId='phone').answer"
    ];
    
    expectedPatterns.forEach(pattern => {
      expect(questionnaireJson).toContain(pattern);
    });
  });

  test('demographics section has required fields', () => {
    const demographics = findItem('patient-demographics');
    expect(demographics?.type).toBe('group');
    
    const requiredFields = ['first-name', 'last-name', 'ssn', 'gender-identity'];
    requiredFields.forEach(fieldId => {
      expect(findItem(fieldId)?.required).toBe(true);
    });
  });

  test('has repeatable groups for allergies and medications', () => {
    expect(findItem('allergies')?.repeats).toBe(true);
    expect(findItem('medications')?.repeats).toBe(true);
  });

  test('coded fields use correct value sets', () => {
    expect(findItem('state')?.answerValueSet).toContain('us-core-usps-state');
    expect(findItem('race')?.answerValueSet).toContain('omb-race-category');
    expect(findItem('ethnicity')?.answerValueSet).toContain('omb-ethnicity-category');
  });

  test('estimated delivery date has conditional logic', () => {
    const deliveryDateField = findItem('estimated-delivery-date');
    
    expect(deliveryDateField?.enableWhen?.[0]).toMatchObject({
      question: 'pregnancy-status',
      operator: '='
    });
  });

  test('all consent sections have proper structure', () => {
    const consentLinkIds = [
      'consent-for-treatment',
      'agreement-to-pay-for-treatment',
      'notice-of-privacy-practices',
      'acknowledgement-for-advance-directives'
    ];
    
    consentLinkIds.forEach(linkId => {
      const section = findItem(linkId);
      expect(section?.type).toBe('group');
      
      const hasTemplateExtension = section?.extension?.some(e => e.url === SDC_TEMPLATE_EXTRACT);
      expect(hasTemplateExtension).toBe(true);
    });
  });

  test('SDOH section has all expected fields', () => {
    const sdohSection = findItem('social-determinants-of-health');
    expect(sdohSection?.text).toBe('Social Determinants of Health');
    
    const expectedFields = [
      'housing-status',
      'education-level',
      'smoking-status',
      'veteran-status',
      'pregnancy-status',
      'estimated-delivery-date'
    ];
    
    expectedFields.forEach(fieldId => {
      expect(findItem(fieldId)).toBeDefined();
    });
  });

  test('all template references are valid', () => {
    const templateRefs = questionnaireJson.match(/#tmpl-[^"']+/g) || [];
    
    templateRefs.forEach(ref => {
      const templateId = ref.slice(1);
      expect(findTemplate(templateId)).toBeDefined();
    });
  });
});