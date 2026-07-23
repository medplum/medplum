// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import type {
  Parameters,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';

const DEFAULT_MODEL = 'gpt-5.4-nano';

const REFERENCE_RESOURCE_EXTENSION = 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource';

/*
 * The model maps the transcript onto a flat {linkId: value} delta instead of authoring FHIR.
 * The bot converts the delta to QuestionnaireResponse items deterministically, so the model
 * cannot malform the resource, and generation stays fast because the output is tiny.
 */
const SYSTEM_PROMPT = `You are a medical questionnaire assistant. Your task is to map a user's voice input onto form fields.

You are given FORM_SCHEMA (the form's fields), FORM_STATE (the answers captured so far as {linkId: value}), and a transcript of what the user just said.

Return ONLY a minified JSON object of the form {"updates":{...},"clear":[...]} with no markdown code fences and no prose.
- "updates" contains ONLY the fields the user's input adds or changes, keyed by linkId. Do NOT echo unchanged fields.
- "clear" is an optional array of linkIds the user wants blanked without a replacement. Never clear a linkId you are also updating.
- If the input changes nothing, return {"updates":{}}.

Field value rules:
- string fields: the value as a string.
- boolean fields: true or false.
- integer/decimal fields: a number.
- date fields: "yyyy-MM-dd". dateTime fields: ISO 8601. Convert any spoken date.
- choice fields with an "options" list: the value MUST be one of the option "value" strings.
- choice fields without options: the user's answer as natural text (it is matched to a terminology server afterwards).
- reference fields: the name of the thing the user said (e.g. a pharmacy or insurance company name).
- A field whose type ends in "[]" repeats: its value is an ARRAY holding every entry that should be present.

Repeating groups (type "group[]") hold an ARRAY of objects, one object per instance, keyed by the group's inner field linkIds. Because the array replaces all instances of that group, ALWAYS carry over the instances already present in FORM_STATE that the user did not remove or change.

Example — FORM_SCHEMA has fields "name" (string), "age" (integer), and repeating group "emergency-contact" with inner fields "ec-first-name" and "ec-last-name". FORM_STATE is {"emergency-contact":[{"ec-first-name":"Stephen","ec-last-name":"Graham"}]}.
User's spoken input: "My name is John Smith, I'm 35, and add my brother Bart Simpson as an emergency contact"
Return:
{"updates":{"name":"John Smith","age":35,"emergency-contact":[{"ec-first-name":"Stephen","ec-last-name":"Graham"},{"ec-first-name":"Bart","ec-last-name":"Simpson"}]}}`;

/*
 * Legacy prompt: the model authors QuestionnaireResponse items directly. Kept as a fallback for
 * turns where the flat output fails to parse, so exotic inputs degrade to the old behavior
 * instead of being dropped.
 */
const LEGACY_SYSTEM_PROMPT = `You are a medical questionnaire assistant. Your task is to map a user's voice input onto a FHIR Questionnaire.

You are given a FHIR Questionnaire, the answers already captured so far (if any), and a transcript of what the user just said.

Return ONLY a JSON object of the form { "item": [ ... ] } containing ONLY the top-level questionnaire items whose answers you are adding or changing based on the user's latest input.

Important guidelines:
- Include ONLY the items the user's input affects. Do NOT echo back items the user did not mention — they are preserved automatically, including sibling answers inside a group you partially change.
- Each returned item must use the questionnaire item's linkId. For a group, return the group item containing ONLY the nested items whose answers changed (other answers in that group are preserved).
- Use the correct value type for each question (valueString, valueBoolean, valueInteger, valueCoding, valueDate, etc.) based on the question's type.
- For a repeating top-level group (a group with "repeats": true), include ALL instances you want present for that group, because they share a linkId and your returned instances fully replace the existing ones. Carry over instances already captured that the user did not change.
- If the user's input does not change any answers, return { "item": [] }.
- Do NOT wrap the JSON in markdown code fences.`;

type FieldType = 'string' | 'date' | 'dateTime' | 'boolean' | 'integer' | 'decimal' | 'choice' | 'reference';

interface FieldOption {
  value: string;
  label: string;
  system?: string;
}

interface FlatField {
  kind: 'field';
  linkId: string;
  label: string;
  group?: string;
  /** linkIds of ancestor non-repeating groups, root first, used to rebuild the item tree. */
  path: string[];
  type: FieldType;
  repeats: boolean;
  required: boolean;
  options?: FieldOption[];
  valueSet?: string;
  referenceTarget?: string;
}

interface FlatRepeatingGroup {
  kind: 'repeating-group';
  linkId: string;
  label: string;
  path: string[];
  /** Leaf fields inside the group; their path is relative to the group instance. */
  fields: FlatField[];
}

type FlatEntry = FlatField | FlatRepeatingGroup;

interface FlatModelOutput {
  updates: Record<string, unknown>;
  clear: string[];
}

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

  const schema = buildFlatSchema(questionnaire);
  const formState = responseToFormState(schema, existingResponse?.item ?? []);

  const userMessage = `FORM_SCHEMA:\n${JSON.stringify(schema.map(entryForPrompt))}\n\nFORM_STATE:\n${JSON.stringify(formState)}\n\nUser's spoken input:\n${transcript}`;

  const responseText = await callAi(medplum, model, SYSTEM_PROMPT, userMessage);
  const flat = tryParseFlatOutput(responseText);

  const repeatingLinkIds = new Set<string>();
  collectRepeatingLinkIds(questionnaire.item, repeatingLinkIds);

  let mergedItems: QuestionnaireResponseItem[];
  if (flat) {
    const { changedItems, clears } = await buildChangedItems(medplum, schema, flat);
    mergedItems = mergeResponseItems(existingResponse?.item ?? [], changedItems, repeatingLinkIds);
    mergedItems = applyClears(mergedItems, clears, repeatingLinkIds);
  } else {
    // The flat output didn't parse; retry the turn with the legacy FHIR-authoring prompt.
    mergedItems = await runLegacyTurn(medplum, model, questionnaire, existingResponse, transcript, repeatingLinkIds);
  }

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
 * Calls the server $ai operation and returns the model's text content, stripped of code fences.
 * @param medplum - The Medplum client.
 * @param model - The model to use.
 * @param system - The system prompt.
 * @param user - The user message.
 * @returns The model's text output.
 */
async function callAi(medplum: MedplumClient, model: string, system: string, user: string): Promise<string> {
  const aiParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'messages',
        valueString: JSON.stringify([
          { role: 'system', content: system },
          { role: 'user', content: user },
        ]),
      },
      { name: 'model', valueString: model },
      { name: 'temperature', valueDecimal: 0 },
    ],
  };

  const response = await medplum.post<Parameters>(medplum.fhirUrl('$ai'), aiParameters);
  const contentParam = response.parameter?.find((p) => p.name === 'content');
  if (!contentParam?.valueString) {
    throw new Error('AI response did not contain content');
  }

  let responseText = contentParam.valueString.trim();
  if (responseText.startsWith('```')) {
    responseText = responseText.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
  }
  return responseText;
}

/**
 * Parses the model's flat output, returning undefined when it doesn't match the expected shape
 * (which triggers the legacy fallback).
 * @param text - The model's raw text output.
 * @returns The parsed flat output, or undefined.
 */
function tryParseFlatOutput(text: string): FlatModelOutput | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const obj = parsed as Record<string, unknown>;
  const hasUpdates = obj.updates !== undefined;
  const hasClear = obj.clear !== undefined;
  if (!hasUpdates && !hasClear) {
    return undefined;
  }
  const updates =
    obj.updates && typeof obj.updates === 'object' && !Array.isArray(obj.updates)
      ? (obj.updates as Record<string, unknown>)
      : {};
  const clear = Array.isArray(obj.clear) ? obj.clear.map(String) : [];
  return { updates, clear };
}

// ---------------------------------------------------------------------------
// Flat schema construction
// ---------------------------------------------------------------------------

/**
 * Flattens the questionnaire into fields the model can address by linkId. Non-repeating groups
 * are flattened through (their linkIds recorded on each field's path so the item tree can be
 * rebuilt); repeating groups become one entry holding their inner leaf fields.
 * @param questionnaire - The questionnaire to flatten.
 * @returns The flat schema entries.
 */
function buildFlatSchema(questionnaire: Questionnaire): FlatEntry[] {
  const entries: FlatEntry[] = [];

  function walk(items: QuestionnaireItem[], path: string[], groupText: string | undefined): void {
    for (const item of items) {
      if (item.type === 'display') {
        continue;
      }
      if (item.type === 'group') {
        if (item.repeats) {
          const inner: FlatField[] = [];
          collectLeafFields(item.item ?? [], [], item.text ?? groupText, inner);
          entries.push({
            kind: 'repeating-group',
            linkId: item.linkId,
            label: item.text ?? item.linkId,
            path,
            fields: inner,
          });
        } else {
          walk(item.item ?? [], [...path, item.linkId], item.text ?? groupText);
        }
        continue;
      }
      const field = toFlatField(item, path, groupText);
      if (field) {
        entries.push(field);
      }
    }
  }

  function collectLeafFields(
    items: QuestionnaireItem[],
    path: string[],
    groupText: string | undefined,
    out: FlatField[]
  ): void {
    for (const item of items) {
      if (item.type === 'display') {
        continue;
      }
      if (item.type === 'group') {
        // Nested repeating groups inside a repeating group are not representable in the flat
        // format; their fields are skipped (the legacy fallback still covers them).
        if (!item.repeats) {
          collectLeafFields(item.item ?? [], [...path, item.linkId], item.text ?? groupText, out);
        }
        continue;
      }
      const field = toFlatField(item, path, groupText);
      if (field) {
        out.push(field);
      }
    }
  }

  walk(questionnaire.item ?? [], [], undefined);
  return entries;
}

/**
 * Converts a questionnaire leaf item to a flat field, or undefined for unsupported types.
 * @param item - The questionnaire item.
 * @param path - The linkIds of ancestor non-repeating groups.
 * @param groupText - The nearest ancestor group's text, for model context.
 * @returns The flat field, or undefined.
 */
function toFlatField(item: QuestionnaireItem, path: string[], groupText: string | undefined): FlatField | undefined {
  const type = mapFieldType(item.type);
  if (!type) {
    return undefined;
  }
  const field: FlatField = {
    kind: 'field',
    linkId: item.linkId,
    label: item.text ?? item.linkId,
    path,
    type,
    repeats: Boolean(item.repeats),
    required: Boolean(item.required),
  };
  if (groupText) {
    field.group = groupText;
  }
  if (type === 'choice') {
    if (item.answerOption) {
      field.options = item.answerOption
        .map(optionFromAnswerOption)
        .filter((o): o is FieldOption => o !== undefined);
    } else if (item.answerValueSet) {
      field.valueSet = item.answerValueSet;
    }
  }
  if (type === 'reference') {
    const ext = item.extension?.find((e) => e.url === REFERENCE_RESOURCE_EXTENSION);
    field.referenceTarget = ext?.valueCodeableConcept?.coding?.[0]?.code ?? 'Organization';
  }
  return field;
}

function mapFieldType(type: string | undefined): FieldType | undefined {
  switch (type) {
    case 'string':
    case 'text':
      return 'string';
    case 'date':
      return 'date';
    case 'dateTime':
      return 'dateTime';
    case 'boolean':
      return 'boolean';
    case 'integer':
      return 'integer';
    case 'decimal':
      return 'decimal';
    case 'choice':
    case 'open-choice':
      return 'choice';
    case 'reference':
      return 'reference';
    default:
      return undefined;
  }
}

function optionFromAnswerOption(option: NonNullable<QuestionnaireItem['answerOption']>[number]): FieldOption | undefined {
  if (option.valueCoding) {
    const coding = option.valueCoding;
    return {
      value: coding.code ?? coding.display ?? '',
      label: coding.display ?? coding.code ?? '',
      system: coding.system,
    };
  }
  if (option.valueString !== undefined) {
    return { value: option.valueString, label: option.valueString };
  }
  if (option.valueInteger !== undefined) {
    return { value: String(option.valueInteger), label: String(option.valueInteger) };
  }
  if (option.valueDate !== undefined) {
    return { value: option.valueDate, label: option.valueDate };
  }
  return undefined;
}

/**
 * Trims a schema entry to what the model needs (paths, systems, and flags stay server-side).
 * @param entry - The schema entry.
 * @returns The prompt representation.
 */
function entryForPrompt(entry: FlatEntry): Record<string, unknown> {
  if (entry.kind === 'repeating-group') {
    return {
      linkId: entry.linkId,
      label: entry.label,
      type: 'group[]',
      fields: entry.fields.map(entryForPrompt),
    };
  }
  return {
    linkId: entry.linkId,
    label: entry.label,
    ...(entry.group ? { group: entry.group } : {}),
    type: entry.repeats ? `${entry.type}[]` : entry.type,
    ...(entry.required ? { required: true } : {}),
    ...(entry.options ? { options: entry.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Existing response → flat form state (model context)
// ---------------------------------------------------------------------------

/**
 * Projects the existing response onto the flat schema so the model sees what is already captured
 * (and can carry repeating-group instances over).
 * @param schema - The flat schema entries.
 * @param items - The existing response items.
 * @returns The flat form state.
 */
function responseToFormState(schema: FlatEntry[], items: QuestionnaireResponseItem[]): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const entry of schema) {
    if (entry.kind === 'repeating-group') {
      const instances = findAllItems(items, entry.linkId);
      const values = instances
        .map((instance) => {
          const obj: Record<string, unknown> = {};
          for (const field of entry.fields) {
            const leaf = findFirstItem(instance.item ?? [], field.linkId);
            const value = leaf ? answersToPlain(field, leaf.answer) : undefined;
            if (value !== undefined) {
              obj[field.linkId] = value;
            }
          }
          return obj;
        })
        .filter((obj) => Object.keys(obj).length > 0);
      if (values.length > 0) {
        state[entry.linkId] = values;
      }
    } else {
      const leaf = findFirstItem(items, entry.linkId);
      const value = leaf ? answersToPlain(entry, leaf.answer) : undefined;
      if (value !== undefined) {
        state[entry.linkId] = value;
      }
    }
  }
  return state;
}

function findFirstItem(items: QuestionnaireResponseItem[], linkId: string): QuestionnaireResponseItem | undefined {
  for (const item of items) {
    if (item.linkId === linkId) {
      return item;
    }
    const nested = item.item ? findFirstItem(item.item, linkId) : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function findAllItems(items: QuestionnaireResponseItem[], linkId: string): QuestionnaireResponseItem[] {
  const result: QuestionnaireResponseItem[] = [];
  for (const item of items) {
    if (item.linkId === linkId) {
      result.push(item);
    } else if (item.item) {
      result.push(...findAllItems(item.item, linkId));
    }
  }
  return result;
}

function answersToPlain(field: FlatField, answers: QuestionnaireResponseItemAnswer[] | undefined): unknown {
  if (!answers || answers.length === 0) {
    return undefined;
  }
  const values = answers.map((a) => answerToPlain(field, a)).filter((v) => v !== undefined);
  if (values.length === 0) {
    return undefined;
  }
  return field.repeats ? values : values[0];
}

function answerToPlain(field: FlatField, answer: QuestionnaireResponseItemAnswer): unknown {
  if (answer.valueBoolean !== undefined) {
    return answer.valueBoolean;
  }
  if (answer.valueInteger !== undefined) {
    return answer.valueInteger;
  }
  if (answer.valueDecimal !== undefined) {
    return answer.valueDecimal;
  }
  if (answer.valueDate !== undefined) {
    return answer.valueDate;
  }
  if (answer.valueDateTime !== undefined) {
    return answer.valueDateTime;
  }
  if (answer.valueCoding) {
    // Fields with inline options are keyed by code (what the model is told to emit);
    // valueSet-backed fields use display text (what the model naturally produces).
    if (field.options) {
      return answer.valueCoding.code ?? answer.valueCoding.display;
    }
    return answer.valueCoding.display ?? answer.valueCoding.code;
  }
  if (answer.valueReference) {
    return answer.valueReference.display ?? answer.valueReference.reference;
  }
  return answer.valueString;
}

// ---------------------------------------------------------------------------
// Flat updates → QuestionnaireResponse items
// ---------------------------------------------------------------------------

/**
 * Converts the model's flat updates into response items positioned in their proper nested
 * structure, ready for mergeResponseItems. Unknown linkIds are dropped; an empty array for a
 * repeating group becomes a clear.
 * @param medplum - The Medplum client (for valueSet and reference resolution).
 * @param schema - The flat schema entries.
 * @param flat - The model's flat output.
 * @returns The changed item tree and the effective clear list.
 */
async function buildChangedItems(
  medplum: MedplumClient,
  schema: FlatEntry[],
  flat: FlatModelOutput
): Promise<{ changedItems: QuestionnaireResponseItem[]; clears: Set<string> }> {
  const byLinkId = new Map<string, FlatEntry>(schema.map((e) => [e.linkId, e]));
  const changedItems: QuestionnaireResponseItem[] = [];
  const clears = new Set<string>(flat.clear.filter((linkId) => byLinkId.has(linkId)));

  for (const [linkId, value] of Object.entries(flat.updates)) {
    const entry = byLinkId.get(linkId);
    if (!entry || value === undefined || value === null) {
      continue;
    }
    if (entry.kind === 'repeating-group') {
      const instances = Array.isArray(value) ? value : [value];
      const built: QuestionnaireResponseItem[] = [];
      for (const instance of instances) {
        if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
          continue;
        }
        const item = await buildGroupInstance(medplum, entry, instance as Record<string, unknown>);
        if (item) {
          built.push(item);
        }
      }
      if (built.length > 0) {
        for (const item of built) {
          insertNested(changedItems, entry.path, item);
        }
      } else {
        // The model wants zero instances: treat as a clear so existing ones are removed.
        clears.add(entry.linkId);
      }
    } else {
      const answers = await toAnswers(medplum, entry, value);
      if (answers.length > 0) {
        insertNested(changedItems, entry.path, { linkId: entry.linkId, answer: answers });
      }
    }
  }

  return { changedItems, clears };
}

async function buildGroupInstance(
  medplum: MedplumClient,
  group: FlatRepeatingGroup,
  values: Record<string, unknown>
): Promise<QuestionnaireResponseItem | undefined> {
  const instance: QuestionnaireResponseItem = { linkId: group.linkId, item: [] };
  for (const field of group.fields) {
    const value = values[field.linkId];
    if (value === undefined || value === null) {
      continue;
    }
    const answers = await toAnswers(medplum, field, value);
    if (answers.length > 0) {
      insertNested(instance.item as QuestionnaireResponseItem[], field.path, {
        linkId: field.linkId,
        answer: answers,
      });
    }
  }
  return instance.item && instance.item.length > 0 ? instance : undefined;
}

/**
 * Inserts a leaf item under its ancestor group wrappers, creating/reusing wrappers along the path.
 * @param root - The item list to insert into.
 * @param path - The ancestor group linkIds, root first.
 * @param leaf - The leaf item to insert.
 */
function insertNested(root: QuestionnaireResponseItem[], path: string[], leaf: QuestionnaireResponseItem): void {
  let items = root;
  for (const linkId of path) {
    let wrapper = items.find((i) => i.linkId === linkId);
    if (!wrapper) {
      wrapper = { linkId, item: [] };
      items.push(wrapper);
    }
    wrapper.item = wrapper.item ?? [];
    items = wrapper.item;
  }
  items.push(leaf);
}

async function toAnswers(
  medplum: MedplumClient,
  field: FlatField,
  value: unknown
): Promise<QuestionnaireResponseItemAnswer[]> {
  const values = field.repeats && Array.isArray(value) ? value : [value];
  const answers: QuestionnaireResponseItemAnswer[] = [];
  for (const v of values) {
    const answer = await toAnswer(medplum, field, v);
    if (answer) {
      answers.push(answer);
    }
  }
  return answers;
}

/**
 * Deterministically converts a flat value to a typed FHIR answer. This is the safety boundary:
 * whatever the model produced, only well-formed answers of the question's type come out.
 * @param medplum - The Medplum client.
 * @param field - The flat field.
 * @param value - The model-provided value.
 * @returns The typed answer, or undefined if the value can't be converted.
 */
async function toAnswer(
  medplum: MedplumClient,
  field: FlatField,
  value: unknown
): Promise<QuestionnaireResponseItemAnswer | undefined> {
  const str = String(value).trim();
  if (!str) {
    return undefined;
  }
  switch (field.type) {
    case 'boolean':
      return { valueBoolean: value === true || /^(true|yes|y)$/i.test(str) };
    case 'integer': {
      const n = Number(str);
      return Number.isFinite(n) ? { valueInteger: Math.trunc(n) } : undefined;
    }
    case 'decimal': {
      const n = Number(str);
      return Number.isFinite(n) ? { valueDecimal: n } : undefined;
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}/.test(str) ? { valueDate: str.slice(0, 10) } : undefined;
    case 'dateTime':
      if (!/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return undefined;
      }
      return { valueDateTime: str.length <= 10 ? `${str}T00:00:00Z` : str };
    case 'reference': {
      const target = field.referenceTarget ?? 'Organization';
      try {
        const resource = await medplum.searchOne(target as 'Organization', { name: str });
        if (resource?.id) {
          return {
            valueReference: {
              reference: `${target}/${resource.id}`,
              display: (resource as { name?: string }).name ?? str,
            },
          };
        }
      } catch {
        // fall through: unresolved references are dropped rather than guessed
      }
      return undefined;
    }
    case 'choice': {
      const opt = field.options?.find(
        (o) =>
          o.value === str || o.value.toLowerCase() === str.toLowerCase() || o.label.toLowerCase() === str.toLowerCase()
      );
      if (opt) {
        return opt.system
          ? { valueCoding: { system: opt.system, code: opt.value, display: opt.label } }
          : { valueString: opt.value };
      }
      if (field.valueSet) {
        try {
          const vs = await medplum.valueSetExpand({ url: field.valueSet, filter: str, count: 1 });
          const first = vs.expansion?.contains?.[0];
          if (first) {
            return { valueCoding: { system: first.system, code: first.code, display: first.display } };
          }
        } catch {
          // fall through to string
        }
      }
      return { valueString: str };
    }
    default:
      return { valueString: str };
  }
}

/**
 * Removes cleared answers from the merged items: a repeating linkId loses all its instances,
 * a leaf linkId loses its answer.
 * @param items - The merged response items.
 * @param clears - The linkIds to clear.
 * @param repeatingLinkIds - The repeating linkIds from the questionnaire.
 * @returns The items with clears applied.
 */
function applyClears(
  items: QuestionnaireResponseItem[],
  clears: Set<string>,
  repeatingLinkIds: Set<string>
): QuestionnaireResponseItem[] {
  if (clears.size === 0) {
    return items;
  }
  const result: QuestionnaireResponseItem[] = [];
  for (const item of items) {
    if (clears.has(item.linkId)) {
      if (repeatingLinkIds.has(item.linkId)) {
        continue;
      }
      const cleared: QuestionnaireResponseItem = { ...item };
      delete cleared.answer;
      if (cleared.item) {
        cleared.item = applyClears(cleared.item, clears, repeatingLinkIds);
      }
      result.push(cleared);
      continue;
    }
    if (item.item) {
      result.push({ ...item, item: applyClears(item.item, clears, repeatingLinkIds) });
    } else {
      result.push(item);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Legacy fallback: model authors FHIR items directly
// ---------------------------------------------------------------------------

async function runLegacyTurn(
  medplum: MedplumClient,
  model: string,
  questionnaire: Questionnaire,
  existingResponse: QuestionnaireResponse | undefined,
  transcript: string,
  repeatingLinkIds: Set<string>
): Promise<QuestionnaireResponseItem[]> {
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

  const responseText = await callAi(medplum, model, LEGACY_SYSTEM_PROMPT, userMessage);
  const changed = JSON.parse(responseText) as { item?: QuestionnaireResponseItem[] };
  return mergeResponseItems(existingResponse?.item ?? [], changed.item ?? [], repeatingLinkIds);
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

// ---------------------------------------------------------------------------
// Merge (shared by both paths)
// ---------------------------------------------------------------------------

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
 * Merges the changed items into the existing response items, keyed by linkId.
 * - A repeating linkId is replaced as a whole set (its instances share a linkId and can't be
 *   matched up individually, so the changed set contains all instances that should be present).
 * - A non-repeating linkId is merged in place: scalar fields and answers from the change win,
 *   and nested group children are merged recursively so untouched siblings (e.g. a first-name
 *   already captured in a group) are preserved when only one field in the group changes.
 * - Untouched items are kept; linkIds the change introduces are appended.
 * @param existingItems - The items already captured.
 * @param changedItems - The items to add or change.
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

  // Append linkIds the change introduced that weren't already present.
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
 * @param changed - The item returned for this linkId.
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
