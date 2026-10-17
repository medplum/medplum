// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient, WithId } from '@medplum/core';
import { createReference, getQuestionnaireAnswers, HTTP_TERMINOLOGY_HL7_ORG } from '@medplum/core';
import type {
  CodeableConcept,
  Consent,
  DocumentReference,
  Patient,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import type { Content } from 'pdfmake/interfaces';

const SIGNATURE_URL = 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-signature';
const IDENTIFIER_SYSTEM = 'https://medplum.com/preauth-demo/consent-extraction';

function concept(system: string, code: string, display: string): CodeableConcept {
  return { coding: [{ system: `${HTTP_TERMINOLOGY_HL7_ORG}/CodeSystem/${system}`, code, display }] };
}

// One Consent per group of the questionnaire. Mirrors the provider app's /onboarding extraction.
const CONSENT_TYPES = [
  {
    group: 'consent-for-treatment',
    checkbox: 'consent-for-treatment-signature',
    scope: concept('consentscope', 'treatment', 'Treatment'),
    category: concept('v3-ActCode', 'med', 'Medical'),
    policyRule: concept('consentpolicycodes', 'cric', 'Common Rule Informed Consent'),
  },
  {
    group: 'agreement-to-pay-for-treatment',
    checkbox: 'agreement-to-pay-for-treatment-help',
    scope: concept('consentscope', 'treatment', 'Treatment'),
    category: concept('v3-ActCode', 'pay', 'Payment'),
    policyRule: concept('consentpolicycodes', 'hipaa-self-pay', 'HIPAA Self-Pay Restriction'),
  },
  {
    group: 'notice-of-privacy-practices',
    checkbox: 'notice-of-privacy-practices-signature',
    scope: concept('consentscope', 'patient-privacy', 'Patient Privacy'),
    category: concept('v3-ActCode', 'nopp', 'Notice of Privacy Practices'),
    policyRule: concept('consentpolicycodes', 'hipaa-npp', 'HIPAA Notice of Privacy Practices'),
  },
  {
    group: 'acknowledgement-for-advance-directives',
    checkbox: 'acknowledgement-for-advance-directives-signature',
    scope: concept('consentscope', 'adr', 'Advanced Care Directive'),
    category: concept('consentcategorycodes', 'acd', 'Advanced Care Directive'),
    policyRule: { coding: [{ system: 'http://medplum.com', code: 'BasicADR', display: 'Advanced Care Directive' }] },
  },
];

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Consent[]> {
  const response = event.input;

  // Subscriptions can deliver more than once (and runs can fail partway), so every resource is created at most
  // once per response, keyed by an identifier. Consent.source is not searchable, so it can't be used for this.
  function createOnce<T extends Consent | DocumentReference>(key: string, resource: T): Promise<WithId<T>> {
    const identifier = { system: IDENTIFIER_SYSTEM, value: `${response.id}-${key}` };
    return medplum.createResourceIfNoneExist<T>(
      { ...resource, identifier: [identifier] },
      `identifier=${identifier.system}|${identifier.value}`
    );
  }

  const patient = await medplum.readReference(response.subject as Reference<Patient>);
  const questionnaire = await medplum.searchOne('Questionnaire', { url: response.questionnaire });
  const answers = getQuestionnaireAnswers(response);
  const signature = response.extension?.find((e) => e.url === SIGNATURE_URL)?.valueSignature;
  const signedAt = signature?.when ?? response.authored ?? new Date().toISOString();

  // Signed copy of the agreements: each section's text, whether it was accepted, and the signature
  const pdfContent: Content[] = [{ text: 'Patient Consent Forms', style: 'header' }];
  for (const group of questionnaire?.item ?? []) {
    pdfContent.push({ text: group.text ?? '', bold: true, margin: [0, 10, 0, 4] });
    for (const item of group.item ?? []) {
      const answer = answers[item.linkId];
      let text = item.text ?? '';
      if (item.type === 'boolean') {
        text = `${answer?.valueBoolean ? '[X]' : '[ ]'} ${text}`;
      } else if (item.type === 'date') {
        text = `Date: ${answer?.valueDate ?? ''}`;
      }
      pdfContent.push({ text, margin: [0, 0, 0, 4] });
    }
  }
  pdfContent.push(
    { text: `Signed by: ${answers['printed-name']?.valueString ?? ''}`, margin: [0, 20, 0, 4] },
    { text: `Signed at: ${signedAt}` }
  );
  if (signature?.data) {
    pdfContent.push({ image: `data:image/png;base64,${signature.data}`, width: 200, margin: [0, 10, 0, 0] });
  }

  const binary = await medplum.createPdf({
    docDefinition: { content: pdfContent, styles: { header: { fontSize: 16, bold: true } } },
    filename: 'signed-consent-forms.pdf',
  });
  const attachment = { contentType: 'application/pdf', url: `Binary/${binary.id}`, title: 'Signed consent forms' };

  await createOnce<DocumentReference>('pdf', {
    resourceType: 'DocumentReference',
    status: 'current',
    subject: createReference(patient),
    content: [{ attachment }],
    context: { related: [createReference(response)] },
  });

  return Promise.all(
    CONSENT_TYPES.map(({ group, checkbox, category, ...codes }) => {
      const date = answers[`${group}-date`]?.valueDate;
      return createOnce<Consent>(group, {
        resourceType: 'Consent',
        status: answers[checkbox]?.valueBoolean ? 'active' : 'rejected',
        ...codes,
        category: [category],
        patient: createReference(patient),
        performer: [createReference(patient)],
        dateTime: date ? new Date(date).toISOString() : signedAt,
        // source[x] allows a single value: the signed PDF. Its DocumentReference links back to the response.
        sourceAttachment: attachment,
      });
    })
  );
}
