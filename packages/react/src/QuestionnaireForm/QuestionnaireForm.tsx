import { Anchor, Button, Group, Stack, Stepper, Title } from '@mantine/core';
import { createReference, getExtension, getReferenceString, ProfileResource } from '@medplum/core';
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemInitial,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { isQuestionEnabled, QuestionnaireItemType } from '../utils/questionnaire';
import { QuestionnaireFormItem } from './QuestionnaireFormItem/QuestionnaireFormItem';
import { FormSection } from '../FormSection/FormSection';

export interface QuestionnaireFormProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  subject?: Reference;
  submitButtonText?: string;
  onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const questionnaire = useResource(props.questionnaire);
  const [response, setResponse] = useState<QuestionnaireResponse | undefined>();
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => medplum.requestSchema('QuestionnaireResponse'))
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setResponse(questionnaire ? buildInitialResponse(questionnaire) : undefined);
  }, [questionnaire]);

  function setItems(newResponseItems: QuestionnaireResponseItem | QuestionnaireResponseItem[]): void {
    const currentItems = response?.item ?? [];
    const mergedItems = mergeItems(
      currentItems,
      Array.isArray(newResponseItems) ? newResponseItems : [newResponseItems]
    );

    const newResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      item: mergedItems,
    };

    setResponse(newResponse);
  }

  function checkForQuestionEnabled(item: QuestionnaireItem): boolean {
    return isQuestionEnabled(item, response?.item ?? []);
  }

  if (!schemaLoaded || !questionnaire) {
    return null;
  }

  const numberOfPages = getNumberOfPages(questionnaire);
  const nextStep = (): void => setActivePage((current) => current + 1);
  const prevStep = (): void => setActivePage((current) => current - 1);

  return (
    <Form
      testid="questionnaire-form"
      onSubmit={() => {
        if (props.onSubmit && response) {
          props.onSubmit({
            ...response,
            questionnaire: getReferenceString(questionnaire),
            subject: props.subject,
            source: createReference(source as ProfileResource),
            authored: new Date().toISOString(),
            status: 'completed',
          });
        }
      }}
    >
      {questionnaire.title && <Title>{questionnaire.title}</Title>}
      <QuestionnairePageSequence
        items={questionnaire.item ?? []}
        response={response}
        onChange={setItems}
        renderPages={numberOfPages > 1}
        activePage={activePage}
        numberOfPages={numberOfPages}
        checkForQuestionEnabled={checkForQuestionEnabled}
        nextStep={nextStep}
        prevStep={prevStep}
      />
    </Form>
  );
}

interface QuestionnairePageSequenceProps {
  items: QuestionnaireItem[];
  response?: QuestionnaireResponse;
  renderPages: boolean;
  activePage?: number;
  numberOfPages: number;
  submitButtonText?: string;
  checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  onChange: (items: QuestionnaireResponseItem | QuestionnaireResponseItem[]) => void;
  nextStep: () => void;
  prevStep: () => void;
}

function QuestionnairePageSequence(props: QuestionnairePageSequenceProps): JSX.Element {
  const {
    items,
    response,
    activePage,
    onChange,
    nextStep,
    prevStep,
    numberOfPages,
    renderPages,
    submitButtonText,
    checkForQuestionEnabled,
  } = props;

  const form = items.map((item) => {
    const itemResponse = response?.item?.filter((i) => i.linkId === item.linkId) ?? [];

    const repeatedItem =
      item.type === QuestionnaireItemType.group ? (
        <QuestionnaireRepeatedGroup
          key={item.linkId}
          item={item}
          response={itemResponse}
          onChange={onChange}
          checkForQuestionEnabled={checkForQuestionEnabled}
        />
      ) : (
        <QuestionnaireRepeatableItem
          key={item.linkId}
          item={item}
          response={itemResponse[0]}
          onChange={onChange}
          checkForQuestionEnabled={checkForQuestionEnabled}
        />
      );

    if (renderPages) {
      return (
        <Stepper.Step key={item.linkId} label={item.text}>
          {repeatedItem}
        </Stepper.Step>
      );
    }
    return repeatedItem;
  });

  return (
    <>
      {renderPages && (
        <Stepper active={activePage ?? 0} allowNextStepsSelect={false} p={6}>
          {form}
        </Stepper>
      )}
      {!renderPages && <Stack>{form}</Stack>}
      <ButtonGroup
        activePage={activePage ?? 0}
        numberOfPages={numberOfPages}
        nextStep={nextStep}
        prevStep={prevStep}
        submitButtonText={submitButtonText}
      />
    </>
  );
}

interface QuestionnaireRepeatableGroupProps {
  item: QuestionnaireItem;
  response: QuestionnaireResponseItem[];
  checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  onChange: (responses: QuestionnaireResponseItem | QuestionnaireResponseItem[]) => void;
}

function QuestionnaireRepeatedGroup(props: QuestionnaireRepeatableGroupProps): JSX.Element | null {
  const [responses, setResponses] = useState(props.response);

  if (responses.length === 0) {
    return null;
  }

  function onSetRepeatableGroup(newResponseItems: QuestionnaireResponseItem, index: number): void {
    const newResponses = responses.map((responses, idx) => (idx === index ? newResponseItems : responses));
    setResponses(newResponses);
    props.onChange(newResponses);
  }

  function insertNewGroup(): void {
    const newResponse = buildInitialResponseItem(props.item);
    setResponses([...responses, newResponse]);
  }

  return (
    <>
      {responses.map((response, idx) => (
        <QuestionnaireGroup
          key={idx}
          item={props.item}
          response={response}
          checkForQuestionEnabled={props.checkForQuestionEnabled}
          onChange={(r) => onSetRepeatableGroup(r, idx)}
        />
      ))}
      {props.item.repeats && <Anchor onClick={insertNewGroup}>Add Group</Anchor>}
    </>
  );
}

interface QuestionnaireGroupProps {
  item: QuestionnaireItem;
  response: QuestionnaireResponseItem;
  checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  onChange: (response: QuestionnaireResponseItem) => void;
}

function QuestionnaireGroup(props: QuestionnaireGroupProps): JSX.Element | null {
  const { response, checkForQuestionEnabled, onChange } = props;
  function onSetGroup(newResponseItem: QuestionnaireResponseItem): void {
    const newResponse = response?.item?.map((i) =>
      i.linkId === newResponseItem.linkId ? newResponseItem : i
    ) as QuestionnaireResponseItem;
    const groupResponse = { ...response, item: newResponse } as QuestionnaireResponseItem;
    onChange(groupResponse);
  }

  if (!props.checkForQuestionEnabled(props.item)) {
    return null;
  }

  return (
    <div key={props.item.linkId}>
      {props.item.text && (
        <Title order={3} mb="md">
          {props.item.text}
        </Title>
      )}
      {(props.item.item ?? []).map((item, index) => {
        if (item.type === QuestionnaireItemType.group) {
          return item.repeats ? (
            <QuestionnaireRepeatedGroup
              key={index}
              item={item}
              response={response.item?.filter((i) => i.linkId === item.linkId) ?? []}
              checkForQuestionEnabled={checkForQuestionEnabled}
              onChange={(r) => onSetGroup(r as QuestionnaireResponseItem)}
            />
          ) : (
            <QuestionnaireGroup
              key={index}
              item={item}
              checkForQuestionEnabled={checkForQuestionEnabled}
              response={response.item?.find((i) => i.linkId === item.linkId) ?? {}}
              onChange={onSetGroup}
            />
          );
        }
        return (
          <QuestionnaireRepeatableItem
            item={item}
            response={response.item?.find((i) => i.linkId === item.linkId)}
            onChange={onSetGroup}
            checkForQuestionEnabled={checkForQuestionEnabled}
            key={index}
          />
        );
      })}
    </div>
  );
}

interface QuestionnaireRepeatableItemProps {
  item: QuestionnaireItem;
  response?: QuestionnaireResponseItem;
  checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  onChange: (items: QuestionnaireResponseItem) => void;
}

function QuestionnaireRepeatableItem(props: QuestionnaireRepeatableItemProps): JSX.Element | null {
  const { item, response, onChange } = props;
  const [number, setNumber] = useState(getNumberOfRepeats(item, response ?? {}));
  if (!props.checkForQuestionEnabled(item)) {
    return null;
  }

  if (item.type === QuestionnaireItemType.display) {
    return <p key={item.linkId}>{item.text}</p>;
  }

  const showAddButton =
    item?.repeats && item.type !== QuestionnaireItemType.choice && item.type !== QuestionnaireItemType.openChoice;

  // Styling reason to avoid duplicate text
  if (item.type === QuestionnaireItemType.boolean) {
    return <QuestionnaireFormItem key={item.linkId} item={item} response={response} onChange={onChange} index={0} />;
  }

  return (
    <>
      <FormSection key={props.item.linkId} htmlFor={props.item.linkId} title={props.item.text}>
        {[...Array(number)].map((_, index) => (
          <QuestionnaireFormItem key={index} item={item} response={response} onChange={onChange} index={index} />
        ))}
        {showAddButton && <Anchor onClick={() => setNumber((n) => n + 1)}>Add Item</Anchor>}
      </FormSection>
    </>
  );
}

function getNumberOfRepeats(item: QuestionnaireItem, response: QuestionnaireResponseItem): number {
  if (item.type === QuestionnaireItemType.choice || item.type === QuestionnaireItemType.openChoice) {
    return 1;
  }
  const answers = response.answer;
  return answers?.length ? answers.length : 1;
}

function buildInitialResponse(questionnaire: Questionnaire): QuestionnaireResponse {
  const response: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    questionnaire: getReferenceString(questionnaire),
    item: buildInitialResponseItems(questionnaire.item),
  };

  return response;
}

function buildInitialResponseItems(items: QuestionnaireItem[] | undefined): QuestionnaireResponseItem[] {
  return items?.map(buildInitialResponseItem) ?? [];
}

function buildInitialResponseItem(item: QuestionnaireItem): QuestionnaireResponseItem {
  return {
    id: generateId(),
    linkId: item.linkId,
    text: item.text,
    item: buildInitialResponseItems(item.item),
    answer: item.initial?.map(buildInitialResponseAnswer) ?? [],
  };
}

let nextId = 1;
function generateId(): string {
  return 'id-' + nextId++;
}

function buildInitialResponseAnswer(answer: QuestionnaireItemInitial): QuestionnaireResponseItemAnswer {
  // This works because QuestionnaireItemInitial and QuestionnaireResponseItemAnswer
  // have the same properties.
  return { ...answer };
}

/**
 * Returns the number of pages in the questionnaire.
 *
 * By default, a questionnaire is represented as a simple single page questionnaire,
 * so the default return value is 1.
 *
 * If the questionnaire has a page extension on the first item, then the number of pages
 * is the number of top level items in the questionnaire.
 *
 * @param questionnaire - The questionnaire to get the number of pages for.
 * @returns The number of pages in the questionnaire. Default is 1.
 */
function getNumberOfPages(questionnaire: Questionnaire): number {
  const firstItem = questionnaire?.item?.[0];
  if (firstItem) {
    const extension = getExtension(firstItem, 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl');
    if (extension?.valueCodeableConcept?.coding?.[0]?.code === 'page') {
      return (questionnaire.item as QuestionnaireItem[]).length;
    }
  }
  return 1;
}

interface ButtonGroupProps {
  activePage: number;
  numberOfPages: number;
  submitButtonText?: string;
  nextStep: () => void;
  prevStep: () => void;
}

function ButtonGroup(props: ButtonGroupProps): JSX.Element {
  const showBackButton = props.activePage > 0;
  const showNextButton = props.activePage < props.numberOfPages - 1;
  const showSubmitButton = props.activePage === props.numberOfPages - 1;

  return (
    <Group position="right" mt="xl" spacing="xs">
      {showBackButton && <Button onClick={props.prevStep}>Back</Button>}
      {showNextButton && <Button onClick={props.nextStep}>Next</Button>}
      {showSubmitButton && <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>}
    </Group>
  );
}

function mergeIndividualItems(
  prevItem: QuestionnaireResponseItem,
  newItem: QuestionnaireResponseItem
): QuestionnaireResponseItem {
  const mergedNestedItems = mergeItems(prevItem.item ?? [], newItem.item ?? []);

  return {
    ...newItem,
    item: mergedNestedItems,
    answer: newItem.answer && newItem.answer.length > 0 ? newItem.answer : prevItem.answer,
  };
}

function mergeItemsWithSameLinkId(
  prevItems: QuestionnaireResponseItem[],
  newItems: QuestionnaireResponseItem[]
): QuestionnaireResponseItem[] {
  const result: QuestionnaireResponseItem[] = [];
  const maxLength = Math.max(prevItems.length, newItems.length);

  for (let i = 0; i < maxLength; i++) {
    if (prevItems[i] && newItems[i]) {
      // If both old and new items exist for the current index, merge them.
      result.push(mergeIndividualItems(prevItems[i], newItems[i]));
    } else if (newItems[i]) {
      // If only a new item exists for the current index, add it to the result.
      result.push(newItems[i]);
    }
  }
  return result;
}

function mergeItems(
  prevItems: QuestionnaireResponseItem[],
  newItems: QuestionnaireResponseItem[]
): QuestionnaireResponseItem[] {
  let result: QuestionnaireResponseItem[] = [];

  for (const newItem of newItems) {
    const linkId = newItem.linkId;

    const prevMatchedItems = prevItems.filter((oldItem) => oldItem.linkId === linkId);
    const newMatchedItems = newItems.filter((newItem) => newItem.linkId === linkId);

    prevItems = prevItems.filter((item) => item.linkId !== linkId);
    newItems = newItems.filter((item) => item.linkId !== linkId);

    result = result.concat(mergeItemsWithSameLinkId(prevMatchedItems, newMatchedItems));
  }

  result = result.concat(prevItems);

  return result;
}
