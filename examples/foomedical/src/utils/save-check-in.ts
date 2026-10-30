// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { ContentType, createReference, formatHumanName, normalizeErrorString } from '@medplum/core';
import type {
  DocumentReference,
  Identifier,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
  Task,
  TaskInput,
} from '@medplum/fhirtypes';
import type { CheckinResponse } from '@smart-health-checkin/client';
import { CHECKIN_REQUEST_ID_SYSTEM } from '@smart-health-checkin/client/fhir';

export interface SavedCheckIn {
  readonly task: WithId<Task>;
  readonly documentReference: WithId<DocumentReference>;
  /** Problems the patient should know about; the check-in was still sent. */
  readonly warnings: string[];
}

/**
 * Stages a check-in for care team review: the response as received (DocumentReference + Binary), each form's
 * QuestionnaireResponse, a "Review check-in" Task, and a Provenance. Nothing is written into the chart itself.
 *
 * Safe to call again after a failure: the DocumentReference, QuestionnaireResponses, and Task are keyed by the
 * check-in request id, so a retry finds what an earlier attempt created.
 * @param medplum - The Medplum client, signed in as the patient.
 * @param patient - The signed-in patient.
 * @param response - The validated check-in response.
 * @param walletName - The name of the app that answered, for the care team.
 * @returns The created Task and DocumentReference, and any warnings.
 */
export async function saveCheckIn(
  medplum: MedplumClient,
  patient: WithId<Patient>,
  response: CheckinResponse,
  walletName: string
): Promise<SavedCheckIn> {
  const requestId = response.request.id;
  const patientRef = createReference(patient);
  const now = new Date().toISOString();
  const identifier = (suffix = ''): Identifier => ({ system: CHECKIN_REQUEST_ID_SYSTEM, value: requestId + suffix });
  const ifNoneExist = (id: Identifier): string => `identifier=${id.system}|${id.value}`;
  const reviewNotes = getReviewNotes(response, patient);

  let documentReference = await medplum.createResourceIfNoneExist<DocumentReference>(
    {
      resourceType: 'DocumentReference',
      status: 'current',
      identifier: [identifier()],
      type: { text: 'SMART Health Check-in response' },
      description: `SMART Health Check-in from ${walletName}`,
      subject: patientRef,
      author: [patientRef],
      date: now,
      content: [{ attachment: { contentType: ContentType.JSON } }],
    },
    ifNoneExist(identifier())
  );
  if (!documentReference.content[0]?.attachment.url) {
    const securityContext = createReference(documentReference);
    const responseAttachment = await medplum.createAttachment({
      data: JSON.stringify(response.json),
      contentType: ContentType.JSON,
      filename: 'checkin-response.json',
      securityContext,
    });
    const requestAttachment = await medplum.createAttachment({
      data: JSON.stringify(response.request),
      contentType: ContentType.JSON,
      filename: 'checkin-request.json',
      securityContext,
    });
    documentReference = await medplum.updateResource({
      ...documentReference,
      content: [
        { attachment: { ...responseAttachment, title: 'Check-in response' } },
        { attachment: { ...requestAttachment, title: 'Check-in request' } },
      ],
    });
  }

  const formInputs: TaskInput[] = [];
  for (const item of response.request.items) {
    const answers = item.content.kind === 'form.fhir' ? response.form(item.id) : undefined;
    if (!answers) {
      continue;
    }
    // The wallet's QuestionnaireResponse names its own copy of the patient, so point it at ours
    const { id: _id, meta: _meta, ...rest } = answers as unknown as QuestionnaireResponse;
    const formId = identifier('/' + item.id);
    try {
      const qr = await medplum.createResourceIfNoneExist<QuestionnaireResponse>(
        {
          ...rest,
          resourceType: 'QuestionnaireResponse',
          identifier: formId,
          subject: patientRef,
          source: patientRef,
          author: patientRef,
        },
        ifNoneExist(formId)
      );
      formInputs.push({ type: { text: item.title }, valueReference: createReference(qr) });
    } catch (err) {
      reviewNotes.push(
        `${item.title}: answers couldn't be saved (${normalizeErrorString(err)}); see the check-in response.`
      );
    }
  }

  const items = response.items();
  const shared = items.filter((i) => i.status === 'fulfilled' || i.status === 'partial').length;
  const scores = getFormScores(response);
  const task = await medplum.createResourceIfNoneExist<Task>(
    {
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority: 'routine',
      identifier: [identifier()],
      code: { text: 'Review check-in' },
      description: [
        `Review SMART Health Check-in from ${walletName}: shared ${shared} of ${items.length}.`,
        ...scores,
      ].join(' '),
      for: patientRef,
      focus: patientRef,
      requester: patientRef,
      authoredOn: now,
      input: [
        { type: { text: 'Check-in response' }, valueReference: createReference(documentReference) },
        ...formInputs,
        ...items.map((i) => ({
          type: { text: i.title },
          valueString: [i.status ?? 'no valid status', i.message].filter(Boolean).join(': '),
        })),
      ],
      note: reviewNotes.map((text) => ({ text, time: now })),
    },
    ifNoneExist(identifier())
  );

  const warnings: string[] = [];
  try {
    await medplum.createResource({
      resourceType: 'Provenance',
      target: [
        patientRef,
        createReference(documentReference),
        ...formInputs.map((i) => i.valueReference as Reference),
        createReference(task),
      ],
      recorded: now,
      agent: [
        {
          type: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'author' }],
            text: 'Patient-supplied via SMART Health Check-in',
          },
          who: patientRef,
        },
      ],
      entity: [{ role: 'source', what: { identifier: identifier(), display: walletName } }],
    });
  } catch (err) {
    warnings.push(`Your check-in was sent, but its audit record wasn't saved: ${normalizeErrorString(err)}`);
  }

  return { task, documentReference, warnings };
}

/**
 * Things the care team should check before using the shared data.
 * @param response - The validated check-in response.
 * @param patient - The signed-in patient.
 * @returns One note per problem.
 */
function getReviewNotes(response: CheckinResponse, patient: Patient): string[] {
  const notes: string[] = [];
  const walletPatient = response.resources('patient', { type: 'Patient' })[0] as Patient | undefined;
  if (walletPatient) {
    const shared = describePatient(walletPatient);
    const account = describePatient(patient);
    if (shared.toLowerCase() !== account.toLowerCase()) {
      notes.push(
        `The app shared records for ${shared}, but this account is ${account}. Confirm identity before using them.`
      );
    }
  }
  for (const item of response.request.items) {
    for (const card of response.healthCards(item.id).filter((c) => !c.accepted)) {
      notes.push(
        `${item.title}: a SMART Health Card from ${card.issuer ?? 'an unknown issuer'} wasn't accepted (${card.reason ?? 'not verified'}).`
      );
    }
  }
  for (const d of response.disregarded()) {
    notes.push(
      `A record (${d.id ?? `artifact ${d.index}`}) failed the check-in checks and was set aside: ${d.problems.map((p) => p.message).join('; ')}`
    );
  }
  return notes;
}

function describePatient(patient: Patient): string {
  const name = patient.name?.[0] ? formatHumanName(patient.name[0]) : 'unknown name';
  return patient.birthDate ? `${name}, born ${patient.birthDate}` : name;
}

/**
 * Totals for forms whose answer options carry scores, such as PHQ-2. The patient picks answers; the receiver sums them.
 * @param response - The validated check-in response.
 * @returns One sentence per scored form, such as "PHQ-2 depression screen total score: 3."
 */
function getFormScores(response: CheckinResponse): string[] {
  const scores: string[] = [];
  for (const item of response.request.items) {
    if (item.content.kind !== 'form.fhir') {
      continue;
    }
    const questionnaire = item.content.questionnaire as Questionnaire | undefined;
    const answers = response.form(item.id) as QuestionnaireResponse | undefined;
    if (!questionnaire || !answers) {
      continue;
    }
    let total = 0;
    let scored = false;
    for (const question of questionnaire.item ?? []) {
      const answer = answers.item?.find((a) => a.linkId === question.linkId)?.answer?.[0]?.valueCoding;
      const option = question.answerOption?.find(
        (o) => answer && o.valueCoding?.system === answer.system && o.valueCoding?.code === answer.code
      );
      const score = option?.extension?.find(
        (e) => e.url === 'http://hl7.org/fhir/StructureDefinition/ordinalValue'
      )?.valueDecimal;
      if (score !== undefined) {
        total += score;
        scored = true;
      }
    }
    if (scored) {
      scores.push(`${questionnaire.title ?? item.title} total score: ${total}.`);
    }
  }
  return scores;
}
