// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Demo FHIR resources demonstrating the FHIR translation extension:
 * http://hl7.org/fhir/StructureDefinition/translation
 *
 * The extension is placed on the shadow element (`_fieldName`) of any string
 * primitive, carrying translations for one or more BCP-47 language tags.
 */

import type { Coding, Condition, Extension, Patient, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import type { ShadowElement } from '../utils/translation';
import { TRANSLATION_EXTENSION_URL } from '../utils/translation';

/** Canonical URL for the demo Questionnaire. Used for idempotent server-side creation. */
export const QUESTIONNAIRE_CANONICAL_URL = 'https://medplum.com/fhir/Questionnaire/multilingual-demo-intake';

/** Identifier used to find-or-create the demo Patient idempotently. */
export const DEMO_PATIENT_IDENTIFIER = {
  system: 'https://medplum.com/demo-ids',
  value: 'multilingual-demo-patient',
};

// ---------------------------------------------------------------------------
// Local interface extensions
// The generated @medplum/fhirtypes do not expose primitive shadow elements
// directly, so we extend the relevant types here for use in this demo.
// ---------------------------------------------------------------------------

export interface CodingWithTranslation extends Coding {
  _display?: ShadowElement;
}

export interface QuestionnaireItemWithTranslation extends QuestionnaireItem {
  _text?: ShadowElement;
  item?: QuestionnaireItemWithTranslation[];
}

export interface QuestionnaireWithTranslation extends Questionnaire {
  _title?: ShadowElement;
  item?: QuestionnaireItemWithTranslation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function translationExt(lang: string, content: string): Extension {
  return {
    url: TRANSLATION_EXTENSION_URL,
    extension: [
      { url: 'lang', valueCode: lang },
      { url: 'content', valueString: content },
    ],
  };
}

function shadow(...translations: Extension[]): ShadowElement {
  return { extension: translations };
}

// ---------------------------------------------------------------------------
// Demo Patient — preferred language: Spanish
// ---------------------------------------------------------------------------

export const DEMO_PATIENT: Patient = {
  resourceType: 'Patient',
  name: [{ given: ['Maria'], family: 'García' }],
  identifier: [DEMO_PATIENT_IDENTIFIER],
  communication: [
    {
      language: {
        coding: [{ system: 'urn:ietf:bcp:47', code: 'es', display: 'Spanish' }],
        text: 'Spanish',
      },
      preferred: true,
    },
    {
      language: {
        coding: [{ system: 'urn:ietf:bcp:47', code: 'en', display: 'English' }],
        text: 'English',
      },
    },
    {
      language: {
        coding: [{ system: 'urn:ietf:bcp:47', code: 'fr', display: 'French' }],
        text: 'French',
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Demo Questionnaire — multilingual patient intake
// ---------------------------------------------------------------------------

export const DEMO_QUESTIONNAIRE: QuestionnaireWithTranslation = {
  resourceType: 'Questionnaire',
  url: QUESTIONNAIRE_CANONICAL_URL,
  name: 'MultilingualDemoIntake',
  status: 'active',
  title: 'Patient Intake Form',
  _title: shadow(
    translationExt('es', 'Formulario de registro del paciente'),
    translationExt('fr', "Formulaire d'admission du patient"),
    translationExt('zh', '患者入院表格')
  ),
  item: [
    {
      linkId: 'preferred-language',
      type: 'string',
      text: 'What is your preferred language?',
      _text: shadow(
        translationExt('es', '¿Cuál es su idioma preferido?'),
        translationExt('fr', 'Quelle est votre langue préférée ?'),
        translationExt('zh', '您的首选语言是什么？')
      ),
    },
    {
      linkId: 'allergies',
      type: 'boolean',
      text: 'Do you have any known allergies?',
      _text: shadow(
        translationExt('es', '¿Tiene alguna alergia conocida?'),
        translationExt('fr', 'Avez-vous des allergies connues ?'),
        translationExt('zh', '您有已知的过敏症吗？')
      ),
    },
    {
      linkId: 'symptoms',
      type: 'text',
      text: 'Please describe your current symptoms.',
      _text: shadow(
        translationExt('es', 'Por favor describa sus síntomas actuales.'),
        translationExt('fr', 'Veuillez décrire vos symptômes actuels.'),
        translationExt('zh', '请描述您目前的症状。')
      ),
    },
    {
      linkId: 'pain-scale',
      type: 'integer',
      text: 'Rate your pain level (0–10)',
      _text: shadow(
        translationExt('es', 'Califique su nivel de dolor (0–10)'),
        translationExt('fr', 'Évaluez votre niveau de douleur (0–10)'),
        translationExt('zh', '请评估您的疼痛等级 (0–10)')
      ),
    },
    {
      linkId: 'emergency-contact',
      type: 'string',
      text: 'Emergency contact name and phone number',
      _text: shadow(
        translationExt('es', 'Nombre y número de teléfono del contacto de emergencia'),
        translationExt('fr', "Nom et numéro de téléphone du contact d'urgence"),
        translationExt('zh', '紧急联系人姓名和电话号码')
      ),
    },
  ],
};

// ---------------------------------------------------------------------------
// Demo Conditions — SNOMED codes with translated display strings
// ---------------------------------------------------------------------------

export const DEMO_CONDITIONS: (Condition & { code?: { coding?: CodingWithTranslation[] } })[] = [
  {
    resourceType: 'Condition',
    id: 'demo-condition-1',
    subject: { reference: 'Patient/demo-patient' },
    clinicalStatus: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' },
      ],
    },
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '44054006',
          display: 'Diabetes mellitus type 2',
          _display: shadow(
            translationExt('es', 'Diabetes mellitus tipo 2'),
            translationExt('fr', 'Diabète sucré de type 2'),
            translationExt('zh', '2型糖尿病')
          ),
        },
      ],
    },
  },
  {
    resourceType: 'Condition',
    id: 'demo-condition-2',
    subject: { reference: 'Patient/demo-patient' },
    clinicalStatus: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' },
      ],
    },
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '59621000',
          display: 'Essential hypertension',
          _display: shadow(
            translationExt('es', 'Hipertensión esencial'),
            translationExt('fr', 'Hypertension essentielle'),
            translationExt('zh', '原发性高血压')
          ),
        },
      ],
    },
  },
  {
    resourceType: 'Condition',
    id: 'demo-condition-3',
    subject: { reference: 'Patient/demo-patient' },
    clinicalStatus: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' },
      ],
    },
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '195967001',
          display: 'Asthma',
          _display: shadow(translationExt('es', 'Asma'), translationExt('fr', 'Asthme'), translationExt('zh', '哮喘')),
        },
      ],
    },
  },
];
