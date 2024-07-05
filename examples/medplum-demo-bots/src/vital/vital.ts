import { BotEvent, MedplumClient } from '@medplum/core';
import { ProjectSetting, Questionnaire, QuestionnaireItem, QuestionnaireItemAnswerOption } from '@medplum/fhirtypes';
import { QuestionnaireItemType } from '@medplum/react';

type GetLabEvent = {
  endpoint: 'get_labs';
};

type GetMarkersEvent = {
  endpoint: 'get_markers';
  payload: {
    labTestID: string;
  };
};

type GetAoEQuestionnaireEvent = {
  endpoint: 'get_aoe_questionnaire';
  payload: {
    labTestID: string;
  };
};

type Event = GetLabEvent | GetMarkersEvent | GetAoEQuestionnaireEvent;

/**
 * Wrapper around the vital API.
 *
 * @param medplum - An instance of the Medplum client for interacting with the FHIR server.
 * @param event - The BotEvent containing the incoming message.
 *
 * @returns A Promise that resolves to the response data (if successful) or an error message.
 */
export async function handler(
  medplum: MedplumClient,
  event: BotEvent
): Promise<Lab[] | Marker[] | Questionnaire | undefined> {
  if (typeof event.input !== 'object' || !('endpoint' in event.input)) {
    return;
  }

  const input = event.input as Event;

  switch (input.endpoint) {
    case 'get_labs':
      return getLabs(event.secrets);
    case 'get_markers':
      return getMarkers(event.secrets, input.payload.labTestID);
    case 'get_aoe_questionnaire':
      return getAoEQuestionnaire(event.secrets, input.payload.labTestID);
  }
}

async function getLabs(secrets: Record<string, ProjectSetting>): Promise<Lab[]> {
  const labTests = await fetchLabTests(secrets);

  return labTests.map((lt) => lt.lab);
}

async function getMarkers(secrets: Record<string, ProjectSetting>, labTestID: string): Promise<Marker[]> {
  const labTests = await fetchLabTests(secrets);

  return labTests.find((lt) => lt.id === labTestID)?.markers || [];
}

async function getAoEQuestionnaire(secrets: Record<string, ProjectSetting>, markerID: string): Promise<Questionnaire> {
  const markers = await getMarkers(secrets, markerID);

  return {
    resourceType: 'Questionnaire',
    title: 'Medicare Aoe',
    status: 'active',
    item: markers.map((marker) => ({
      linkId: marker.id.toString(),
      text: marker.name,
      type: 'group',
      item: marker.aoe.questions.map<QuestionnaireItem>((question) => ({
        linkId: question.id.toString(),
        text: question.value,
        type: (question.type === 'numeric' ? 'decimal' : question.type) as QuestionnaireItemType,
        required: question.required,
        answerOption: question.answers?.map<QuestionnaireItemAnswerOption>((answer) => ({
          valueString: question.type !== 'numeric' ? answer.value : undefined,
          valueInteger: question.type === 'numeric' ? parseFloat(answer.value) : undefined,
        })),
      })),
    })),
  };
}

async function fetchLabTests(secrets: Record<string, ProjectSetting>): Promise<LabTest[]> {
  const apiKey = secrets['VITAL_API_KEY'].valueString;
  const baseURL = secrets['VITAL_BASE_URL']?.valueString || 'https://api.dev.tryvital.io';

  if (!apiKey || !baseURL) {
    throw new Error('VITAL_API_KEY and VITAL_BASE_URL are required');
  }

  const url = `${baseURL}/v3/lab_tests`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-vital-api-key': apiKey,
    },
  });

  return resp.json();
}

type Lab = {
  id: number;
  slug: string;
  name: string;
  first_line_address: string;
  city: string;
  zipcode: string;
  collection_methods: Array<string>;
  sample_types: Array<string>;
};

type Marker = {
  id: number;
  name: string;
  slug: string;
  description: string;
  lab_id: number;
  provider_id: string;
  type?: string;
  unit: any;
  price: string;
  aoe: {
    questions: Array<{
      id: number;
      required: boolean;
      code: string;
      value: string;
      type: string;
      sequence: number;
      answers: Array<any>;
    }>;
  };
};

export type LabTest = {
  id: string;
  slug: string;
  name: string;
  sample_type: string;
  method: string;
  price: number;
  is_active: boolean;
  status: string;
  fasting: boolean;
  lab: Lab;
  markers?: Array<Marker>;
  is_delegated: boolean;
};
