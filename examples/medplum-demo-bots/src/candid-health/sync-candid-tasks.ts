import { BotEvent, createReference, MedplumClient } from '@medplum/core';
import fetch from 'node-fetch';

const CANDID_API_URL = 'https://api-staging.joincandidhealth.com/api/v1/';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const status = 'open';
  // Craft the queries all status of requested typs
  const candidTaskQuery = {
    skip: 0,
    limit: 100,
    status: status,
    updated_since: '2021-01-01T00:00:00.000Z',
    sort: 'updated_at:desc',
  };

  const result = await getCandidTasks(
    candidTaskQuery,
    event.secrets['CANDID_API_KEY'].valueString as string,
    event.secrets['CANDID_API_SECRET'].valueString as string
  );

  console.log('Received Response from Candid:\n', JSON.stringify(result, null, 2));

  const candidTaskResult = (await result.json()) as CandidTask[];

  for (const candidTask of candidTaskResult) {
    const encounter = await medplum.createResourceIfNoneExist(
      {
        resourceType: 'Encounter',
        status: 'finished',
        class: { code: 'inpatient' },
        identifier: [
          {
            system: 'https://joincandidhealth.com/encounter/id',
            value: candidTask.encounter_id,
          },
        ],
      },
      'identifier=' + candidTask.encounter_id
    );
    await medplum.createResourceIfNoneExist(
      {
        resourceType: 'Task',
        status: 'in-progress',
        intent: 'order',
        identifier: [
          {
            system: 'https://api-staging.joincandidhealth.com/task/id',
            value: candidTask.task_id,
          },
        ],
        businessStatus: {
          coding: [
            {
              system: 'http://joincandidhealth.com/task-status',
              code: candidTask.status,
              display: candidTask.status,
            },
          ],
        },
        code: {
          coding: [
            {
              system: 'http://joincandidhealth.com/task-category',
              code: candidTask.category,
            },
            {
              system: 'http://joincandidhealth.com/task-category-detail',
              code: candidTask.detailed_category,
            },
          ],
        },
        note: candidTask.notes.map((note) => ({
          text: note.text,
          authorString: note.author_name,
          time: note.created_at,
        })),
        encounter: {
          reference: createReference(encounter) as string,
        },
      },
      'identifier=' + candidTask.task_id
    );
  }

  return result;
}

/**
 * Authenticates into the Candid Health API using API key and API secret, and gets the Task object from
 * Candid's /v1/tasks endpoint
 * @param candidCodedEncounter - The CodedEncounter object to send to Candid Health
 * @param apiKey - Candid Health API Key
 * @param apiSecret - Candid Health API Secret
 * @returns The response from the Candid Health API
 */
async function getCandidTasks(candidCodedEncounter: any, apiKey: string, apiSecret: string): Promise<any> {
  // Get a Bearer Token
  const authResponse = await fetch(CANDID_API_URL + 'auth/token', {
    method: 'post',
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const bearerToken = ((await authResponse.json()) as any).access_token;

  // Send the CodedEncounter
  const taskResponse = await fetch(CANDID_API_URL + '/tasks', {
    method: 'get',
    body: JSON.stringify(candidCodedEncounter),
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${bearerToken}` },
  });

  return taskResponse;
}

interface TaskNote {
  text: string;
  task_note_id: string;
  created_at: string;
  author_name: string;
  author_organization_name: string;
}

interface CandidTask {
  encounter_id: string;
  category: string;
  task_id: string;
  external_id: string;
  status: string;
  notes: TaskNote[];
  detailed_category: string;
  created_at: string;
  updated_at: string;
}
