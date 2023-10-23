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
import React, { useEffect, useState } from 'react';
import { Form } from '../Form/Form';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useResource } from '../useResource/useResource';
import { isQuestionEnabled, QuestionnaireItemType } from '../utils/questionnaire';
import { QuestionnaireFormItem } from './QuestionnaireFormItem/NewQuestionnaireFormItem';
import { FormSection } from '../FormSection/FormSection';

export interface QuestionnaireFormProps {
  questionnaire: Questionnaire;
  subject?: Reference;
  submitButtonText?: string;
  onSubmit?: (response: QuestionnaireResponse) => void;
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
      {questionnaire.item && (
        <QuestionnairePageSequence
          items={questionnaire.item ?? []}
          response={response}
          onChange={setItems}
          renderPages={numberOfPages > 1}
          activePage={activePage}
          numberOfPages={numberOfPages}
          nextStep={nextStep}
          prevStep={prevStep}
        />
      )}
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
  onChange: (items: QuestionnaireResponseItem | QuestionnaireResponseItem[]) => void;
  nextStep: () => void;
  prevStep: () => void;
}

function QuestionnairePageSequence(props: QuestionnairePageSequenceProps): JSX.Element {
  const { items, response, activePage, onChange, nextStep, prevStep, numberOfPages, renderPages, submitButtonText } =
    props;

  const form = items.map((item) => {
    const itemResponse = response?.item?.filter((i) => i.linkId === item.linkId) ?? [];

    const repeatedItem =
      item.type === QuestionnaireItemType.group ? (
        <QuestionnaireRepeatedGroup key={item.linkId} item={item} response={itemResponse} onChange={onChange} />
      ) : (
        <QuestionnaireRepeatableItem key={item.linkId} item={item} response={itemResponse[0]} onChange={onChange} />
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
  onChange: (responses: QuestionnaireResponseItem | QuestionnaireResponseItem[]) => void;
}

function QuestionnaireRepeatedGroup(props: QuestionnaireRepeatableGroupProps): JSX.Element | null {
  // find all responses that match this group
  const [responses, setResponses] = useState(props.response);

  if (responses.length === 0) {
    return null;
  }
  // console.log(responses);
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
          onChange={(r) => onSetRepeatableGroup(r, idx)}
          index={idx}
        />
      ))}
      {props.item.repeats && <Anchor onClick={insertNewGroup}>Add Group</Anchor>}
    </>
  );
}

interface QuestionnaireGroupProps {
  item: QuestionnaireItem;
  index?: number;
  response: QuestionnaireResponseItem;
  onChange: (response: QuestionnaireResponseItem) => void;
}

function QuestionnaireGroup(props: QuestionnaireGroupProps): JSX.Element | null {
  const { response, onChange } = props;
  function onSetGroup(newResponseItem: QuestionnaireResponseItem): void {
    const newResponse = response?.item?.map((i) =>
      i.linkId === newResponseItem.linkId ? newResponseItem : i
    ) as QuestionnaireResponseItem;
    const groupResponse = {...response, item: newResponse} as QuestionnaireResponseItem;
    console.log(groupResponse)
    onChange(groupResponse);
  }

  // use context + hook
  // if (!isQuestionEnabled(item, [])) {
  //   return null;
  // }

  return (
    <>
      {(props.item.item ?? []).map((item, index) => {
        if (item.type === QuestionnaireItemType.group) {
          return item.repeats ? (
            <QuestionnaireRepeatedGroup
              key={index}
              item={item}
              response={response.item?.filter((i) => i.linkId === item.linkId) ?? []}
              onChange={(r) => onSetGroup(r as QuestionnaireResponseItem)}
            />
          ) : (
            <QuestionnaireGroup
              key={index}
              item={item}
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
            key={index}
          />
        );
      })}
    </>
  );
}

interface QuestionnaireRepeatableItemProps {
  item: QuestionnaireItem;
  response?: QuestionnaireResponseItem;
  onChange: (items: QuestionnaireResponseItem) => void;
}

function QuestionnaireRepeatableItem(props: QuestionnaireRepeatableItemProps): JSX.Element | null {
  const { item, response, onChange } = props;
  const [number, setNumber] = useState(1);
  // if (!isQuestionEnabled(item, [])) {
  //   return null;
  // }

  if (item.type === QuestionnaireItemType.display) {
    return <p key={item.linkId}>{item.text}</p>;
  }

  const showAddButton =
    item?.repeats && item.type !== QuestionnaireItemType.choice && item.type !== QuestionnaireItemType.openChoice;

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
 * @param questionnaire The questionnaire to get the number of pages for.
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
  // Recursively merge the nested items.
  const mergedNestedItems = mergeItems(prevItem.item ?? [], newItem.item ?? []);

  return {
    ...newItem,
    item: mergedNestedItems,
    // Prioritize answers from the new item, but fall back to the old item's answers if the new item doesn't provide any.
    answer: newItem.answer && newItem.answer.length > 0 ? newItem.answer : prevItem.answer,
  };
}

function mergeItemsWithSameLinkId(
  prevItems: QuestionnaireResponseItem[],
  newItems: QuestionnaireResponseItem[]
): QuestionnaireResponseItem[] {
  const result: QuestionnaireResponseItem[] = [];
  const maxLength = Math.max(prevItems.length, newItems.length);

  // Loop over items to handle cases where there are varying counts of items with the same linkId between old and new items.
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

  // Iterate over all linkIds from newItems.
  for (const newItem of newItems) {
    const linkId = newItem.linkId;

    // Gather all items from the old list that share the current linkId.
    const prevMatchedItems = prevItems.filter((oldItem) => oldItem.linkId === linkId);
    const newMatchedItems = newItems.filter((newItem) => newItem.linkId === linkId);

    // Remove matched items from prevItems to prevent merging them multiple times.
    prevItems = prevItems.filter((item) => item.linkId !== linkId);
    newItems = newItems.filter((item) => item.linkId !== linkId);

    // Merge the gathered items and append to the result.
    result = result.concat(mergeItemsWithSameLinkId(prevMatchedItems, newMatchedItems));
  }

  // Add remaining items from prevItems to result.
  result = result.concat(prevItems);

  return result;
}
