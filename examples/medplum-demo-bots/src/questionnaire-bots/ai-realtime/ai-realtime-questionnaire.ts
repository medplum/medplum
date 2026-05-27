// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Parameters, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';

const DEFAULT_MODEL = 'gpt-5.4-nano';

const SYSTEM_PROMPT = `You are a medical questionnaire assistant. Your task is to help users fill out medical questionnaires using voice input.

Given a FHIR Questionnaire, any existing QuestionnaireResponse (if provided), and a transcript of what the user said, generate a valid FHIR QuestionnaireResponse that accurately captures their answers.

Important guidelines:
- Return ONLY a valid JSON QuestionnaireResponse resource
- If an existing QuestionnaireResponse is provided, modify it based on the user's spoken input (add, update, or remove answers as appropriate)
- Map the user's spoken answers to the appropriate questionnaire items using linkId
- Use appropriate value types (valueString, valueBoolean, valueCoding, etc.) based on the question type
- If the user's answer is ambiguous or doesn't clearly map to a question, use your best judgment
- Preserve any existing answers that the user didn't mention
- Set status to "in-progress" since this is a draft response

Example 1:
Questionnaire:
{
  "resourceType": "Questionnaire",
  "status": "active",
  "item": [
    {
      "linkId": "1",
      "text": "What is your name?",
      "type": "string"
    },
    {
      "linkId": "2",
      "text": "What is your age?",
      "type": "integer"
    }
  ]
}

User's spoken input: "My name is John Smith and I'm 35 years old"

Expected QuestionnaireResponse:
{
  "resourceType": "QuestionnaireResponse",
  "status": "in-progress",
  "item": [
    {
      "linkId": "1",
      "text": "What is your name?",
      "answer": [
        {
          "valueString": "John Smith"
        }
      ]
    },
    {
      "linkId": "2",
      "text": "What is your age?",
      "answer": [
        {
          "valueInteger": 35
        }
      ]
    }
  ]
}

Example 2:
Questionnaire:
{
  "resourceType": "Questionnaire",
  "status": "active",
  "item": [
    {
      "linkId": "1",
      "text": "Do you have any allergies?",
      "type": "boolean"
    },
    {
      "linkId": "2",
      "text": "Please list your allergies",
      "type": "string",
      "enableWhen": [
        {
          "question": "1",
          "operator": "=",
          "answerBoolean": true
        }
      ]
    },
    {
      "linkId": "3",
      "text": "Are you currently taking any medications?",
      "type": "boolean"
    }
  ]
}

Existing QuestionnaireResponse:
{
  "resourceType": "QuestionnaireResponse",
  "status": "in-progress",
  "item": [
    {
      "linkId": "1",
      "answer": [
        {
          "valueBoolean": true
        }
      ]
    }
  ]
}

User's spoken input: "I'm allergic to penicillin and yes I'm taking metformin"

Expected QuestionnaireResponse:
{
  "resourceType": "QuestionnaireResponse",
  "status": "in-progress",
  "item": [
    {
      "linkId": "1",
      "answer": [
        {
          "valueBoolean": true
        }
      ]
    },
    {
      "linkId": "2",
      "answer": [
        {
          "valueString": "penicillin"
        }
      ]
    },
    {
      "linkId": "3",
      "answer": [
        {
          "valueBoolean": true
        }
      ]
    }
  ]
}`;

export async function handler(medplum: MedplumClient, event: BotEvent<Parameters>): Promise<Parameters> {
  const input = event.input;

  const questionnaireParam = input.parameter?.find((p) => p.name === 'questionnaire');
  const questionnaireResponseParam = input.parameter?.find((p) => p.name === 'questionnaireResponse');
  const transcriptParam = input.parameter?.find((p) => p.name === 'transcript');
  const modelParam = input.parameter?.find((p) => p.name === 'model');

  if (!questionnaireParam?.valueString) {
    throw new Error('questionnaire parameter is required');
  }
  if (!transcriptParam?.valueString?.trim()) {
    throw new Error('transcript parameter is required');
  }

  const questionnaire = JSON.parse(questionnaireParam.valueString) as Questionnaire;
  const existingResponse = questionnaireResponseParam?.valueString
    ? (JSON.parse(questionnaireResponseParam.valueString) as QuestionnaireResponse)
    : undefined;
  const transcript = transcriptParam.valueString;
  const model = modelParam?.valueString || DEFAULT_MODEL;

  let userMessage = `Questionnaire:\n${JSON.stringify(questionnaire, null, 2)}`;
  if (existingResponse?.item && existingResponse.item.length > 0) {
    userMessage += `\n\nExisting QuestionnaireResponse:\n${JSON.stringify(existingResponse, null, 2)}`;
  }
  userMessage += `\n\nUser's spoken input:\n${transcript}`;

  const aiParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'messages',
        valueString: JSON.stringify([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ]),
      },
      { name: 'model', valueString: model },
      { name: 'temperature', valueString: '0.3' },
    ],
  };

  const response = await medplum.post<Parameters>(medplum.fhirUrl('$ai'), aiParameters);

  const contentParam = response.parameter?.find((p) => p.name === 'content');
  if (!contentParam?.valueString) {
    throw new Error('AI response did not contain content');
  }

  // The AI might wrap the JSON in markdown code blocks; strip them before parsing.
  let responseText = contentParam.valueString.trim();
  if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
  }

  const questionnaireResponse = JSON.parse(responseText) as QuestionnaireResponse;

  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'questionnaireResponse',
        valueString: JSON.stringify(questionnaireResponse),
      },
    ],
  };
}
