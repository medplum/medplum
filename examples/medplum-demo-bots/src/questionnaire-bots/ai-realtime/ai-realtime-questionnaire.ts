// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Parameters,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
} from '@medplum/fhirtypes';

const DEFAULT_MODEL = 'gpt-5.4-nano';

const SYSTEM_PROMPT = `You are a medical questionnaire assistant. Your task is to map a user's voice input onto a FHIR Questionnaire.

You are given a FHIR Questionnaire, the answers already captured so far (if any), and a transcript of what the user just said.

Return ONLY a JSON object of the form { "item": [ ... ] } containing ONLY the top-level questionnaire items whose answers you are adding or changing based on the user's latest input.

Important guidelines:
- Include ONLY the items the user's input affects. Do NOT echo back items the user did not mention — they are preserved automatically, including sibling answers inside a group you partially change.
- Each returned item must use the questionnaire item's linkId. For a group, return the group item containing ONLY the nested items whose answers changed (other answers in that group are preserved).
- Use the correct value type for each question (valueString, valueBoolean, valueInteger, valueCoding, valueDate, etc.) based on the question's type.
- For a repeating top-level group (a group with "repeats": true), include ALL instances you want present for that group, because they share a linkId and your returned instances fully replace the existing ones. Carry over instances already captured that the user did not change.
- If the user's input does not change any answers, return { "item": [] }.
- Do NOT wrap the JSON in markdown code fences.

Example — questionnaire has top-level items "name" (string) and "age" (integer), nothing captured yet.
User's spoken input: "My name is John Smith and I'm 35"
Return:
{
  "item": [
    { "linkId": "name", "answer": [{ "valueString": "John Smith" }] },
    { "linkId": "age", "answer": [{ "valueInteger": 35 }] }
  ]
}

Example — a top-level repeating group "emergency-contact" already has one instance (first-name "Stephen", last-name "Graham"). The user adds a second contact.
User's spoken input: "Add my brother Bart Simpson as an emergency contact"
Return both instances (the existing one is carried over because the group is replaced as a whole):
{
  "item": [
    {
      "linkId": "emergency-contact",
      "item": [
        { "linkId": "emergency-contact-first-name", "answer": [{ "valueString": "Stephen" }] },
        { "linkId": "emergency-contact-last-name", "answer": [{ "valueString": "Graham" }] }
      ]
    },
    {
      "linkId": "emergency-contact",
      "item": [
        { "linkId": "emergency-contact-first-name", "answer": [{ "valueString": "Bart" }] },
        { "linkId": "emergency-contact-last-name", "answer": [{ "valueString": "Simpson" }] }
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

  // Trim the prompt: only the fields the model needs to map answers, minified, with the existing
  // response reduced to items that actually carry an answer.
  const slimQuestionnaire = {
    resourceType: 'Questionnaire',
    item: (questionnaire.item ?? []).map(slimQuestionnaireItem),
  };
  let userMessage = `Questionnaire:\n${JSON.stringify(slimQuestionnaire)}`;
  const answeredItems = stripForPrompt(existingResponse?.item ?? []);
  if (answeredItems.length > 0) {
    userMessage += `\n\nAnswers captured so far:\n${JSON.stringify({ item: answeredItems })}`;
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
      { name: 'temperature', valueDecimal: 0.3 },
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

  // The model returns only the changed items; merge them into the existing response. Repeating
  // groups (per the questionnaire) are replaced as a whole set; everything else merges by linkId.
  const changed = JSON.parse(responseText) as { item?: QuestionnaireResponseItem[] };
  const repeatingLinkIds = new Set<string>();
  collectRepeatingLinkIds(questionnaire.item, repeatingLinkIds);
  const mergedItems = mergeResponseItems(existingResponse?.item ?? [], changed.item ?? [], repeatingLinkIds);

  const questionnaireResponse: QuestionnaireResponse = {
    ...existingResponse,
    resourceType: 'QuestionnaireResponse',
    status: 'in-progress',
    item: mergedItems,
  };

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

/**
 * Reduces a questionnaire item to the fields the model needs to map spoken answers, dropping
 * bulky fields (extension, code) that don't affect mapping. Recurses into nested items.
 * @param item - The questionnaire item to slim down.
 * @returns A minimal copy of the item.
 */
function slimQuestionnaireItem(item: QuestionnaireItem): Record<string, unknown> {
  const slim: Record<string, unknown> = { linkId: item.linkId, type: item.type };
  if (item.text) {
    slim.text = item.text;
  }
  if (item.required) {
    slim.required = item.required;
  }
  if (item.repeats) {
    slim.repeats = item.repeats;
  }
  if (item.answerValueSet) {
    slim.answerValueSet = item.answerValueSet;
  }
  if (item.answerOption) {
    slim.answerOption = item.answerOption;
  }
  if (item.enableWhen) {
    slim.enableWhen = item.enableWhen;
  }
  if (item.enableBehavior) {
    slim.enableBehavior = item.enableBehavior;
  }
  if (item.item) {
    slim.item = item.item.map(slimQuestionnaireItem);
  }
  return slim;
}

/**
 * Reduces a response item tree to only items that carry an answer (directly or via descendants),
 * dropping text/id so the "answers captured so far" context stays small.
 * @param items - The response items to strip.
 * @returns The stripped items, omitting any with no answers.
 */
function stripForPrompt(items: QuestionnaireResponseItem[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const item of items) {
    const childItems = item.item ? stripForPrompt(item.item) : undefined;
    const hasAnswer = Boolean(item.answer && item.answer.length > 0);
    const hasChildren = Boolean(childItems && childItems.length > 0);
    if (!hasAnswer && !hasChildren) {
      continue;
    }
    const stripped: Record<string, unknown> = { linkId: item.linkId };
    if (hasAnswer) {
      stripped.answer = item.answer;
    }
    if (hasChildren) {
      stripped.item = childItems;
    }
    result.push(stripped);
  }
  return result;
}

/**
 * Collects the linkIds of every repeating item in the questionnaire, recursing into groups.
 * @param items - The questionnaire items to scan.
 * @param set - The set to add repeating linkIds to.
 */
function collectRepeatingLinkIds(items: QuestionnaireItem[] | undefined, set: Set<string>): void {
  for (const item of items ?? []) {
    if (item.repeats) {
      set.add(item.linkId);
    }
    collectRepeatingLinkIds(item.item, set);
  }
}

/**
 * Merges the model's changed items into the existing response items, keyed by linkId.
 * - A repeating linkId is replaced as a whole set (its instances share a linkId and can't be
 *   matched up individually, so the model returns all instances it wants present).
 * - A non-repeating linkId is merged in place: scalar fields and answers from the change win,
 *   and nested group children are merged recursively so untouched siblings (e.g. a first-name
 *   already captured in a group) are preserved when only one field in the group changes.
 * - Untouched items are kept; linkIds the model introduces are appended.
 * @param existingItems - The items already captured.
 * @param changedItems - The items the model wants to add or change.
 * @param repeatingLinkIds - The set of repeating linkIds from the questionnaire.
 * @returns The merged item list.
 */
function mergeResponseItems(
  existingItems: QuestionnaireResponseItem[],
  changedItems: QuestionnaireResponseItem[],
  repeatingLinkIds: Set<string>
): QuestionnaireResponseItem[] {
  const changedByLinkId = new Map<string, QuestionnaireResponseItem[]>();
  const order: string[] = [];
  for (const item of changedItems) {
    const existing = changedByLinkId.get(item.linkId);
    if (existing) {
      existing.push(item);
    } else {
      changedByLinkId.set(item.linkId, [item]);
      order.push(item.linkId);
    }
  }

  const consumed = new Set<string>();
  const merged: QuestionnaireResponseItem[] = [];
  for (const item of existingItems) {
    const replacements = changedByLinkId.get(item.linkId);
    if (!replacements) {
      merged.push(item);
      continue;
    }
    // Handle all instances of this linkId at the position of the first one; skip the rest.
    if (consumed.has(item.linkId)) {
      continue;
    }
    consumed.add(item.linkId);
    if (repeatingLinkIds.has(item.linkId)) {
      merged.push(...replacements);
    } else {
      merged.push(mergeSingleItem(item, replacements[0], repeatingLinkIds));
    }
  }

  // Append linkIds the model introduced that weren't already present.
  for (const linkId of order) {
    if (!consumed.has(linkId)) {
      merged.push(...(changedByLinkId.get(linkId) as QuestionnaireResponseItem[]));
      consumed.add(linkId);
    }
  }

  return merged;
}

/**
 * Merges a single non-repeating item: the change's scalar fields and answer win, while nested
 * group children are merged recursively so previously answered siblings are preserved.
 * @param existing - The item already captured.
 * @param changed - The item the model returned for this linkId.
 * @param repeatingLinkIds - The set of repeating linkIds from the questionnaire.
 * @returns The merged item.
 */
function mergeSingleItem(
  existing: QuestionnaireResponseItem,
  changed: QuestionnaireResponseItem,
  repeatingLinkIds: Set<string>
): QuestionnaireResponseItem {
  const merged: QuestionnaireResponseItem = { ...existing, ...changed };
  if (existing.item || changed.item) {
    merged.item = mergeResponseItems(existing.item ?? [], changed.item ?? [], repeatingLinkIds);
  }
  return merged;
}
