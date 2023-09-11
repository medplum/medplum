import { Anchor, Button, Group, Stack, Stepper, Title } from '@mantine/core';
import {
  createReference,
  getAllQuestionnaireAnswers,
  getExtension,
  getReferenceString,
  IndexedStructureDefinition,
  ProfileResource,
} from '@medplum/core';
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
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { useResource } from '../useResource/useResource';
import { QuestionnaireItemType, isQuestionEnabled } from '../utils/questionnaire';
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
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const questionnaire = useResource(props.questionnaire);
  const [response, setResponse] = useState<QuestionnaireResponse | undefined>();
  const [answers, setAnswers] = useState<Record<string, QuestionnaireResponseItemAnswer[]>>({});
  const [activePage, setActivePage] = useState(0);

  const numberOfPages = getNumberOfPages(questionnaire?.item ?? []);
  const nextStep = (): void => setActivePage((current) => (current >= numberOfPages ? current : current + 1));
  const prevStep = (): void => setActivePage((current) => (current <= 0 ? current : current - 1));

  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => medplum.requestSchema('QuestionnaireResponse'))
      .then(setSchema)
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setResponse(questionnaire ? buildInitialResponse(questionnaire) : undefined);
  }, [questionnaire]);

  function setItems(newResponseItems: QuestionnaireResponseItem[]): void {
    const newResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      item: newResponseItems,
    };
    setResponse(newResponse);
    const newAnswers = getAllQuestionnaireAnswers(newResponse);
    setAnswers((prevAnswers) => ({
      ...prevAnswers,
      ...newAnswers,
    }));
  }

  if (!schema || !questionnaire) {
    return null;
  }

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
          answers={answers}
          onChange={setItems}
          renderPages={numberOfPages > 1}
          activePage={activePage}
        />
      )}
      <Group position="right" mt="xl">
        <ButtonGroup
          activePage={activePage}
          numberOfPages={numberOfPages}
          nextStep={nextStep}
          prevStep={prevStep}
          submitButtonText={props.submitButtonText}
        />
      </Group>
    </Form>
  );
}

interface QuestionnaireFormItemArrayProps {
  items: QuestionnaireItem[];
  answers: Record<string, QuestionnaireResponseItemAnswer[]>;
  renderPages?: boolean;
  activePage?: number;
  onChange: (newResponseItems: QuestionnaireResponseItem[]) => void;
}

function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  const [responseItems, setResponseItems] = useState<QuestionnaireResponseItem[]>(
    buildInitialResponseItems(props.items)
  );

  function setResponseItem(responseId: string, newResponseItem: QuestionnaireResponseItem): void {
    const itemExists = responseItems.some((r) => r.id === responseId);
    let newResponseItems;
    if (itemExists) {
      newResponseItems = responseItems.map((r) => (r.id === responseId ? newResponseItem : r));
    } else {
      newResponseItems = [...responseItems, newResponseItem];
    }
    setResponseItems(newResponseItems);
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
            answers={props.answers}
            responseItems={responseItems}
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
        answers={props.answers}
        responseItems={responseItems}
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
  answers: Record<string, QuestionnaireResponseItemAnswer[]>;
  responseItems: QuestionnaireResponseItem[];
  setResponseItem: (responseId: string, newResponseItem: QuestionnaireResponseItem) => void;
}

function QuestionnaireFormArrayContent(props: QuestionnaireFormArrayContentProps): JSX.Element | null {
  if (!isQuestionEnabled(props.item, props.answers)) {
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
        answers={props.answers}
        responseItems={props.responseItems}
        onChange={(newResponseItem) => props.setResponseItem(newResponseItem.id as string, newResponseItem)}
      />
    );
  }
  return (
    <FormSection key={props.item.linkId} htmlFor={props.item.linkId} title={props.item.text ?? ''}>
      <QuestionnaireRepeatWrapper
        item={props.item}
        answers={props.answers}
        responseItems={props.responseItems}
        onChange={(newResponseItem) => props.setResponseItem(newResponseItem.id as string, newResponseItem)}
      />
    </FormSection>
  );
}

export interface QuestionnaireRepeatWrapperProps {
  item: QuestionnaireItem;
  answers: Record<string, QuestionnaireResponseItemAnswer[]>;
  responseItems: QuestionnaireResponseItem[];
  onChange: (newResponseItem: QuestionnaireResponseItem, index?: number) => void;
}

export function QuestionnaireRepeatWrapper(props: QuestionnaireRepeatWrapperProps): JSX.Element {
  const item = props.item;
  function onChangeItem(newResponseItems: QuestionnaireResponseItem[], number?: number): void {
    const index = number ?? 0;
    const responses = props.responseItems.filter((r) => r.linkId === item.linkId);
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
        answers={props.answers}
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
  if (props.activePage === 0 && props.numberOfPages <= 0) {
    return <Button type="submit">{props.submitButtonText ?? 'OK'}</Button>;
  } else if (props.activePage >= props.numberOfPages) {
    return (
      <>
        <Button onClick={props.prevStep}>Back</Button>
        <Button onClick={props.nextStep} type="submit">
          {props.submitButtonText ?? 'OK'}
        </Button>
      </>
    );
  } else if (props.activePage === 0) {
    return (
      <>
        <Button onClick={props.nextStep}>Next</Button>
      </>
    );
  } else {
    return (
      <>
        <Button onClick={props.prevStep}>Back</Button>
        <Button onClick={props.nextStep}>Next</Button>
      </>
    );
  }
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

function getNumberOfPages(items: QuestionnaireItem[]): number {
  const pages = items.filter((item) => {
    const extension = getExtension(item, 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl');
    return extension?.valueCodeableConcept?.coding?.[0]?.code === 'page';
  });
  return pages.length > 0 ? items.length : 0;
}

interface RepeatableGroupProps {
  item: QuestionnaireItem;
  text: string;
  answers: Record<string, QuestionnaireResponseItemAnswer[]>;
  onChange: (newResponseItem: QuestionnaireResponseItem[], index?: number) => void;
}

function RepeatableGroup(props: RepeatableGroupProps): JSX.Element | null {
  const [number, setNumber] = useState(1);

  const item = props.item;
  return (
    <>
      {[...Array(number)].map((_, i) => {
        return (
          <div key={i}>
            <h3>{props.text}</h3>
            <QuestionnaireFormItemArray
              items={item.item ?? []}
              answers={props.answers}
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
