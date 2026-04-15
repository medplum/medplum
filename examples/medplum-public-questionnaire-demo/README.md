# Public questionnaire demo

This demo app allows a patient to access a Questionnaire and submit a QuestionnaireResponse without having to authenticate.

Questionnaire URLs are unique and contain an invite token that must match a Task resource's identifier in ready status. Task must also be linked to a Patient and Questionnaire.

## What you must set up

1. Client id + secret in config.ts.
2. Bot: Create and deploy a Bot using the Bot Code below. Add your bot ID to config.ts.
3. Task: Create a Task with: `status=ready`, `intent=order`, `for` = Patient, `focus` = `Questionnaire/<id>`. Identifier system must match the Bot, value = your `?invite=` token.

## Bot Code
import { BotEvent, MedplumClient } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';

const INVITE_IDENTIFIER_SYSTEM = 'https://your-org.example/fhir/NamingSystem/questionnaire-invite';

async function resolveInvite(medplum: MedplumClient, token: string): Promise<Task> {
  const invites = await medplum.searchResources('Task', {
    identifier: `${INVITE_IDENTIFIER_SYSTEM}|${token}`,
    status: 'ready',
    _count: '2',
  });
  if (invites.length !== 1) {
    throw new Error('Invalid invite');
  }
  const invite = invites[0] as Task;
  const end = invite.restriction?.period?.end;
  if (!invite.for || (end && Date.parse(end) < Date.now())) {
    throw new Error('Invalid invite');
  }
  if (!invite.focus?.reference?.startsWith('Questionnaire/')) {
    throw new Error('Invalid invite');
  }
  return invite;
}

/** True if the invite has a Questionnaire focus and the response targets that same Questionnaire. */
async function responseMatchesFocus(
  medplum: MedplumClient,
  invite: Task,
  response: QuestionnaireResponse
): Promise<boolean> {
  const focusRef = invite.focus?.reference;
  if (!focusRef?.startsWith('Questionnaire/')) {
    return false;
  }
  const focusId = focusRef.slice('Questionnaire/'.length).split('/')[0];
  const q = response.questionnaire;

  if (typeof q === 'string') {
    if (q.startsWith('Questionnaire/')) {
      const id = q.slice('Questionnaire/'.length).split('/')[0];
      return id === focusId;
    }
    const loaded = await medplum.readResource<Questionnaire>('Questionnaire', focusId);
    return loaded.url === q;
  }

  if (q && typeof q === 'object' && 'reference' in q) {
    const ref = (q as { reference?: string }).reference;
    if (ref?.startsWith('Questionnaire/')) {
      const id = ref.slice('Questionnaire/'.length).split('/')[0];
      return id === focusId;
    }
  }

  return false;
}

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const body = event.input as {
    token?: string;
    action?: string;
    response?: QuestionnaireResponse;
  };
  if (!body?.token || typeof body.token !== 'string') {
    throw new Error('Invalid input');
  }

  const invite = await resolveInvite(medplum, body.token);

  if (body.action === 'questionnaire') {
    const ref = invite.focus?.reference;
    if (!ref?.startsWith('Questionnaire/')) {
      throw new Error('Invalid invite');
    }
    const qid = ref.slice('Questionnaire/'.length).split('/')[0];
    const questionnaire = await medplum.readResource('Questionnaire', qid);
    return { questionnaire };
  }

  const response = body.response;
  if (!response || response.resourceType !== 'QuestionnaireResponse') {
    throw new Error('Invalid input');
  }

  const ok = await responseMatchesFocus(medplum, invite, response);
  if (!ok) {
    throw new Error('Invalid invite');
  }

  const created = await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: response.questionnaire,
    authored: response.authored ?? new Date().toISOString(),
    subject: invite.for,
    item: response.item,
  });

  await medplum.updateResource<Task>({
    ...invite,
    resourceType: 'Task',
    status: 'completed',
    output: [
      ...(invite.output ?? []),
      {
        type: { text: 'QuestionnaireResponse' },
        valueReference: { reference: `QuestionnaireResponse/${created.id}` },
      },
    ],
  });

  return { questionnaireResponseId: created.id };
}