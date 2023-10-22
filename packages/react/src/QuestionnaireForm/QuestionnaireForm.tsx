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
import { FormSection } from '../FormSection/FormSection';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useResource } from '../useResource/useResource';
import { isQuestionEnabled, QuestionnaireItemType } from '../utils/questionnaire';
import { QuestionnaireFormItem } from './QuestionnaireFormItem/QuestionnaireFormItem';

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

  function setItems(newResponseItems: QuestionnaireResponseItem[]): void {
    const currentItems = response?.item ?? [];
    const mergedItems = mergeItems(currentItems, newResponseItems);

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
        <QuestionnaireFormItemArray
          items={questionnaire.item ?? []}
          allResponses={response?.item ?? []}
          onChange={setItems}
          renderPages={numberOfPages > 1}
          activePage={activePage}
        />
      )}

      <ButtonGroup
        activePage={activePage}
        numberOfPages={numberOfPages}
        nextStep={nextStep}
        prevStep={prevStep}
        submitButtonText={props.submitButtonText}
      />
    </Form>
  );
}

interface QuestionnaireFormItemArrayProps {
  items: QuestionnaireItem[];
  allResponses: QuestionnaireResponseItem[];
  renderPages?: boolean;
  activePage?: number;
  groupSequence?: number;
  onChange: (newResponseItems: QuestionnaireResponseItem[]) => void;
}

function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  const [currentResponseItems, setCurrentResponseItems] = useState<QuestionnaireResponseItem[]>(
    buildInitialResponseItems(props.items)
  );

  function setResponseItem(responseId: string, newResponseItem: QuestionnaireResponseItem): void {
    const itemExists = currentResponseItems.some((r) => r.id === responseId);
    let newResponseItems;
    if (itemExists) {
      newResponseItems = currentResponseItems.map((r) => (r.id === responseId ? newResponseItem : r));
    } else {
      newResponseItems = [...currentResponseItems, newResponseItem];
    }
    setCurrentResponseItems(newResponseItems);
    props.onChange(newResponseItems);
  }

  const questionForm = props.items.map((item, index) => {
    if (props.renderPages) {
      return (
        <Stepper.Step label={item.text} key={item.linkId}>
          <QuestionnaireFormArrayContent
            key={`${item.linkId}-${index}`}
            item={item}
            index={index}
            allResponses={props.allResponses}
            currentResponseItems={currentResponseItems}
            groupSequence={props.groupSequence}
            setResponseItem={setResponseItem}
          />
        </Stepper.Step>
      );
    }
    return (
      <QuestionnaireFormArrayContent
        key={`${item.linkId}-${index}`}
        item={item}
        index={index}
        groupSequence={props.groupSequence}
        allResponses={props.allResponses}
        currentResponseItems={currentResponseItems}
        setResponseItem={setResponseItem}
      />
    );
  });

  if (props.renderPages) {
    return (
      <Stepper active={props.activePage ?? 0} allowNextStepsSelect={false} p={6}>
        {questionForm}
      </Stepper>
    );
  }
  return <Stack>{questionForm}</Stack>;
}

interface QuestionnaireFormArrayContentProps {
  item: QuestionnaireItem;
  index: number;
  allResponses: QuestionnaireResponseItem[];
  currentResponseItems: QuestionnaireResponseItem[];
  groupSequence?: number;
  setResponseItem: (responseId: string, newResponseItem: QuestionnaireResponseItem) => void;
}

function QuestionnaireFormArrayContent(props: QuestionnaireFormArrayContentProps): JSX.Element | null {
  if (!isQuestionEnabled(props.item, props.allResponses)) {
    return null;
  }
  if (props.item.type === QuestionnaireItemType.display) {
    return <p key={props.item.linkId}>{props.item.text}</p>;
  }
  if (props.item.type === QuestionnaireItemType.group) {
    return (
      <QuestionnaireRepeatWrapper
        key={props.item.linkId}
        item={props.item}
        allResponses={props.allResponses}
        currentResponseItems={props.currentResponseItems}
        groupSequence={props.groupSequence}
        onChange={(newResponseItem) => props.setResponseItem(newResponseItem.id as string, newResponseItem)}
      />
    );
  }

  if (props.item.type === QuestionnaireItemType.boolean) {
    return (
      <QuestionnaireRepeatWrapper
        item={props.item}
        allResponses={props.allResponses}
        currentResponseItems={props.currentResponseItems}
        groupSequence={props.groupSequence}
        onChange={(newResponseItem) => props.setResponseItem(newResponseItem.id as string, newResponseItem)}
      />
    );
  }

  return (
    <FormSection
      key={props.item.linkId}
      htmlFor={props.item.linkId}
      title={props.item.text}
      withAsterisk={props.item.required}
    >
      <QuestionnaireRepeatWrapper
        item={props.item}
        allResponses={props.allResponses}
        currentResponseItems={props.currentResponseItems}
        groupSequence={props.groupSequence}
        onChange={(newResponseItem) => props.setResponseItem(newResponseItem.id as string, newResponseItem)}
      />
    </FormSection>
  );
}

export interface QuestionnaireRepeatWrapperProps {
  item: QuestionnaireItem;
  allResponses: QuestionnaireResponseItem[];
  currentResponseItems: QuestionnaireResponseItem[];
  groupSequence?: number;
  onChange: (newResponseItem: QuestionnaireResponseItem, index?: number) => void;
}

export function QuestionnaireRepeatWrapper(props: QuestionnaireRepeatWrapperProps): JSX.Element {
  const item = props.item;
  function onChangeItem(newResponseItems: QuestionnaireResponseItem[], number?: number): void {
    const index = number ?? 0;
    const responses = props.currentResponseItems.filter((r) => r.linkId === item.linkId);
    props.onChange({
      id: getResponseId(responses, index),
      linkId: item.linkId,
      text: item.text,
      item: newResponseItems,
    });
  }
  if (item.type === QuestionnaireItemType.group) {
    return (
      <RepeatableGroup
        key={props.item.linkId}
        text={item.text ?? ''}
        item={item ?? []}
        allResponses={props.allResponses}
        onChange={onChangeItem}
      />
    );
  }
  return (
    <RepeatableItem item={props.item} key={props.item.linkId}>
      {({ index }: { index: number }) => <QuestionnaireFormItem {...props} index={index} />}
    </RepeatableItem>
  );
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
      {showNextButton && (
        <Button
          onClick={(e) => {
            const form = e.currentTarget.closest('form') as HTMLFormElement;
            if (form.reportValidity()) {
              props.nextStep();
            }
          }}
        >
          Next
        </Button>
      )}
      {showSubmitButton && <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>}
    </Group>
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

interface RepeatableGroupProps {
  item: QuestionnaireItem;
  text: string;
  allResponses: QuestionnaireResponseItem[];
  onChange: (newResponseItem: QuestionnaireResponseItem[], index?: number) => void;
}

function RepeatableGroup(props: RepeatableGroupProps): JSX.Element | null {
  const [number, setNumber] = useState(getNumberOfGroups(props.item, props.allResponses));

  const item = props.item;
  return (
    <>
      {[...Array(number)].map((_, i) => {
        return (
          <div key={i}>
            {props.text && (
              <Title order={3} mb="md">
                {props.text}
              </Title>
            )}
            <QuestionnaireFormItemArray
              items={item.item ?? []}
              allResponses={props.allResponses}
              groupSequence={i}
              onChange={(response) => props.onChange(response, i)}
            />
          </div>
        );
      })}
      {props.item.repeats && <Anchor onClick={() => setNumber((n) => n + 1)}>Add Group</Anchor>}
    </>
  );
}

interface RepeatableItemProps {
  item: QuestionnaireItem;
  children: (props: { index: number }) => JSX.Element;
}

function RepeatableItem(props: RepeatableItemProps): JSX.Element {
  const [number, setNumber] = useState(1);
  const showAddButton =
    props.item?.repeats &&
    props.item.type !== QuestionnaireItemType.choice &&
    props.item.type !== QuestionnaireItemType.openChoice;
  return (
    <>
      {[...Array(number)].map((_, i) => {
        return <React.Fragment key={`${props.item.linkId}-${i}`}>{props.children({ index: i })}</React.Fragment>;
      })}
      {showAddButton && <Anchor onClick={() => setNumber((n) => n + 1)}>Add Item</Anchor>}
    </>
  );
}

function getResponseId(responses: QuestionnaireResponseItem[], index: number): string {
  if (responses.length === 0 || responses.length < index + 1) {
    return generateId();
  }
  return responses[index].id as string;
}

function getNumberOfGroups(item: QuestionnaireItem, responses: QuestionnaireResponseItem[]): number {
  // This is to maintain the group number for the stepper
  const responseLength = responses.filter((r) => r.linkId === item.linkId).length;
  return responseLength > 0 ? responseLength : 1;
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

  // Iterate over unique linkIds from newItems.
  for (const linkId of new Set(newItems.map((item) => item.linkId))) {
    // Gather all items from the old and new list that share the current linkId.
    const prevMatchedItems = prevItems.filter((oldItem) => oldItem.linkId === linkId);
    const newMatchedItems = newItems.filter((newItem) => newItem.linkId === linkId);

    // Merge the gathered items and append to the result.
    result = result.concat(mergeItemsWithSameLinkId(prevMatchedItems, newMatchedItems));
  }

  return result;
}
