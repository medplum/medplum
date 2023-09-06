import {
  Anchor,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NativeSelect,
  Radio,
  Stack,
  Stepper,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import {
  capitalize,
  createReference,
  evalFhirPathTyped,
  getAllQuestionnaireAnswers,
  getExtension,
  getReferenceString,
  getTypedPropertyValue,
  globalSchema,
  IndexedStructureDefinition,
  ProfileResource,
  PropertyType,
  stringify,
  TypedValue,
} from '@medplum/core';
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemEnableWhen,
  QuestionnaireItemInitial,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import React, { ChangeEvent, useEffect, useState } from 'react';
import { AttachmentInput } from '../AttachmentInput/AttachmentInput';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { Form } from '../Form/Form';
import { FormSection } from '../FormSection/FormSection';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { useResource } from '../useResource/useResource';
import { QuestionnaireItemType } from '../utils/questionnaire';

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
    setAnswers(getAllQuestionnaireAnswers(newResponse));
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
      <Stepper active={props.activePage ?? 0} allowNextStepsSelect={false}>
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

export interface QuestionnaireFormItemProps {
  item: QuestionnaireItem;
  index: number;
  answers: Record<string, QuestionnaireResponseItemAnswer[]>;
  responseItems?: QuestionnaireResponseItem[];
  onChange: (newResponseItem: QuestionnaireResponseItem) => void;
}

export function QuestionnaireFormItem(props: QuestionnaireFormItemProps): JSX.Element | null {
  const item = props.item;
  const index = props.index;

  function onChangeAnswer(
    newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[],
    repeatedIndex?: number
  ): void {
    const number = repeatedIndex ?? 0;
    const responses = props.responseItems?.filter((r) => r.linkId === item.linkId) ?? [];

    let updatedAnswers: QuestionnaireResponseItemAnswer[];
    console.log(props.answers, item);
    if (Array.isArray(newResponseAnswer)) {
      // It's a multi-select case, so use the array directly.
      updatedAnswers = newResponseAnswer;
    } else {
      // It's a single answer case.
      updatedAnswers = updateAnswerArray(responses[0]?.answer ?? [], number, newResponseAnswer);
    }
    props.onChange({
      id: responses[0].id,
      linkId: item.linkId,
      text: item.text,
      answer: updatedAnswers,
    });
  }

  const type = item.type as QuestionnaireItemType;
  if (!type) {
    return null;
  }

  const name = item.linkId;
  if (!name) {
    return null;
  }

  const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;

  switch (type) {
    case QuestionnaireItemType.boolean:
      return (
        <CheckboxFormSection key={props.item.linkId} title={props.item.text} htmlFor={props.item.linkId}>
          <Checkbox
            id={props.item.linkId}
            name={props.item.linkId}
            defaultChecked={initial?.valueBoolean ?? defaultValueById(props.answers, item)}
            onChange={(e) => onChangeAnswer({ valueBoolean: e.currentTarget.checked }, index)}
          />
        </CheckboxFormSection>
      );
    case QuestionnaireItemType.decimal:
      return (
        <TextInput
          type="number"
          step="any"
          id={name}
          name={name}
          defaultValue={initial?.valueDecimal ?? defaultValueById(props.answers, item)}
          onChange={(e) => onChangeAnswer({ valueDecimal: e.currentTarget.valueAsNumber }, index)}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <TextInput
          type="number"
          step={1}
          id={name}
          name={name}
          defaultValue={initial?.valueInteger ?? defaultValueById(props.answers, item)}
          onChange={(e) => onChangeAnswer({ valueInteger: e.currentTarget.valueAsNumber }, index)}
        />
      );
    case QuestionnaireItemType.date:
      return (
        <TextInput
          type="date"
          id={name}
          name={name}
          defaultValue={initial?.valueDate ?? defaultValueById(props.answers, item)}
          onChange={(e) => onChangeAnswer({ valueDate: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          name={name}
          defaultValue={initial?.valueDateTime ?? defaultValueById(props.answers, item)}
          onChange={(newValue: string) => onChangeAnswer({ valueDateTime: newValue }, index)}
        />
      );
    case QuestionnaireItemType.time:
      return (
        <TextInput
          type="time"
          id={name}
          name={name}
          defaultValue={initial?.valueTime ?? defaultValueById(props.answers, item)}
          onChange={(e) => onChangeAnswer({ valueTime: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return (
        <TextInput
          id={name}
          name={name}
          defaultValue={initial?.valueString ?? defaultValueById(props.answers, item)}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.text:
      return (
        <Textarea
          id={name}
          name={name}
          defaultValue={initial?.valueString ?? defaultValueById(props.answers, item)}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.attachment:
      return (
        <AttachmentInput
          name={name}
          defaultValue={initial?.valueAttachment ?? defaultValueById(props.answers, item)}
          onChange={(newValue) => onChangeAnswer({ valueAttachment: newValue }, index)}
        />
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput
          name={name}
          targetTypes={addTargetTypes(item) ?? defaultValueById(props.answers, item)}
          defaultValue={initial?.valueReference}
          onChange={(newValue) => onChangeAnswer({ valueReference: newValue }, index)}
        />
      );
    case QuestionnaireItemType.quantity:
      return (
        <QuantityInput
          name={name}
          defaultValue={initial?.valueQuantity ?? defaultValueById(props.answers, item)}
          onChange={(newValue) => onChangeAnswer({ valueQuantity: newValue }, index)}
          disableWheel
        />
      );
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item)) {
        return (
          <QuestionnaireChoiceDropDownInput
            name={name}
            item={item}
            initial={initial}
            answers={props.answers}
            onChangeAnswer={(e) => onChangeAnswer(e, index)}
          />
        );
      } else {
        return (
          <QuestionnaireChoiceRadioInput
            name={name}
            item={item}
            initial={initial}
            answers={props.answers}
            onChangeAnswer={(e) => onChangeAnswer(e, index)}
          />
        );
      }
    default:
      return null;
  }
}

interface QuestionnaireChoiceInputProps {
  name: string;
  item: QuestionnaireItem;
  initial: QuestionnaireItemInitial | undefined;
  answers: Record<string, QuestionnaireResponseItemAnswer[]>;
  onChangeAnswer: (newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[]) => void;
}

function QuestionnaireChoiceDropDownInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial } = props;
  const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
    | TypedValue
    | undefined;

  const data = [''];
  if (item.answerOption) {
    for (const option of item.answerOption) {
      const optionValue = getTypedPropertyValue(
        { type: 'QuestionnaireItemAnswerOption', value: option },
        'value'
      ) as TypedValue;
      data.push(typedValueToString(optionValue) as string);
    }
  }
  if (item.repeats) {
    const { propertyName, data } = convertToDesiredFormat(props.item);
    return (
      <MultiSelect
        data={data}
        placeholder="Select items"
        searchable
        onChange={(selected) => {
          const values = selected.map((o) => {
            const option = item.answerOption?.find((option) =>
              propertyName === 'valueCoding'
                ? option.valueCoding?.code === o
                : option[propertyName as keyof QuestionnaireItemAnswerOption] === o
            );
            const optionValue = getTypedPropertyValue(
              { type: 'QuestionnaireItemAnswerOption', value: option },
              'value'
            ) as TypedValue;
            return { [propertyName]: optionValue.value };
          });
          props.onChangeAnswer(values as QuestionnaireResponseItemAnswer[]);
        }}
        onCreate={(query) => query}
      />
    );
  }

  return (
    <NativeSelect
      id={name}
      name={name}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
        const index = e.currentTarget.selectedIndex;
        if (index === 0) {
          props.onChangeAnswer({});
          return;
        }
        const option = (item.answerOption as QuestionnaireItemAnswerOption[])[index - 1];
        const optionValue = getTypedPropertyValue(
          { type: 'QuestionnaireItemAnswerOption', value: option },
          'value'
        ) as TypedValue;
        const propertyName = 'value' + capitalize(optionValue.type);
        props.onChangeAnswer({ [propertyName]: optionValue.value });
      }}
      defaultValue={typedValueToString(initialValue) ?? defaultValueById(props.answers, item)}
      data={data}
    />
  );
}

function typedValueToString(typedValue: TypedValue | undefined): string | undefined {
  if (!typedValue) {
    return undefined;
  }
  if (typedValue.type === 'CodeableConcept') {
    return typedValue.value.coding[0].display;
  }
  if (typedValue.type === 'Coding') {
    return typedValue.value.display;
  }
  return typedValue.value.toString();
}

function QuestionnaireChoiceRadioInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer } = props;
  const valueElementDefinition = globalSchema.types['QuestionnaireItemAnswerOption'].properties['value[x]'];
  const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
    | TypedValue
    | undefined;

  const options: [string, TypedValue][] = [];
  let defaultValue = undefined;
  if (item.answerOption) {
    for (let i = 0; i < item.answerOption.length; i++) {
      const option = item.answerOption[i];
      const optionName = `${name}-option-${i}`;
      const optionValue = getTypedPropertyValue(
        { type: 'QuestionnaireItemAnswerOption', value: option },
        'value'
      ) as TypedValue;

      if (initialValue && stringify(optionValue) === stringify(initialValue)) {
        defaultValue = optionName;
      }
      options.push([optionName, optionValue]);
    }
  }

  return (
    <Radio.Group
      name={name}
      defaultValue={defaultValue}
      onChange={(newValue) => {
        const option = options.find((option) => option[0] === newValue);
        if (option) {
          const optionValue = option[1];
          const propertyName = 'value' + capitalize(optionValue.type);
          onChangeAnswer({ [propertyName]: optionValue.value });
        }
      }}
    >
      {options.map(([optionName, optionValue]) => (
        <Radio
          key={optionName}
          id={optionName}
          value={optionName}
          label={
            <ResourcePropertyDisplay
              property={valueElementDefinition}
              propertyType={optionValue.type as PropertyType}
              value={optionValue.value}
            />
          }
        />
      ))}
    </Radio.Group>
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

function isDropDownChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'drop-down'
  );
}

export function isQuestionEnabled(
  item: QuestionnaireItem,
  answers: Record<string, QuestionnaireResponseItemAnswer[]>
): boolean {
  if (!item.enableWhen) {
    return true;
  }

  const enableBehavior = item.enableBehavior ?? 'any';

  for (const enableWhen of item.enableWhen) {
    if (
      enableWhen.operator === 'exists' &&
      !enableWhen.answerBoolean &&
      !answers[enableWhen.question as string]?.length
    ) {
      if (enableBehavior === 'any') {
        return true;
      } else {
        continue;
      }
    }
    const { anyMatch, allMatch } = checkAnswers(enableWhen, answers, enableBehavior);

    if (enableBehavior === 'any' && anyMatch) {
      return true;
    }
    if (enableBehavior === 'all' && !allMatch) {
      return false;
    }
  }

  return enableBehavior !== 'any';
}

function evaluateMatch(actualAnswer: TypedValue | undefined, expectedAnswer: TypedValue, operator?: string): boolean {
  if (operator === 'exists') {
    return !!actualAnswer === expectedAnswer.value;
  } else if (!actualAnswer) {
    return false;
  } else {
    const fhirPathOperator = operator === '=' || operator === '!=' ? operator?.replace('=', '~') : operator;
    const [{ value }] = evalFhirPathTyped(`%actualAnswer ${fhirPathOperator} %expectedAnswer`, [actualAnswer], {
      actualAnswer,
      expectedAnswer,
    });
    return value;
  }
}

function checkAnswers(
  enableWhen: QuestionnaireItemEnableWhen,
  answers: Record<string, QuestionnaireResponseItemAnswer[]>,
  enableBehavior: 'any' | 'all'
): { anyMatch: boolean; allMatch: boolean } {
  const actualAnswers = answers[enableWhen.question as string] || [];
  const expectedAnswer = getTypedPropertyValue(
    {
      type: 'QuestionnaireItemEnableWhen',
      value: enableWhen,
    },
    'answer[x]'
  ) as TypedValue;

  let anyMatch = false;
  let allMatch = true;

  for (const actualAnswerValue of actualAnswers) {
    const actualAnswer = getTypedPropertyValue(
      {
        type: 'QuestionnaireResponseItemAnswer',
        value: actualAnswerValue,
      },
      'value[x]'
    ) as TypedValue | undefined;
    const { operator } = enableWhen;
    const match = evaluateMatch(actualAnswer, expectedAnswer, operator);
    if (match) {
      anyMatch = true;
    } else {
      allMatch = false;
    }

    if (enableBehavior === 'any' && anyMatch) {
      break;
    }
  }

  return { anyMatch, allMatch };
}

function getNumberOfPages(items: QuestionnaireItem[]): number {
  const pages = items.filter((item) => {
    const extension = getExtension(item, 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl');
    return extension?.valueCodeableConcept?.coding?.[0]?.code === 'page';
  });
  return pages.length > 0 ? items.length : 0;
}

function addTargetTypes(item: QuestionnaireItem): string[] {
  if (item.type !== QuestionnaireItemType.reference) {
    return [];
  }
  const extensions = item.extension?.filter(
    (e) => e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource'
  );
  if (!extensions || extensions.length === 0) {
    return [];
  }
  const targets = extensions.map((e) => e.valueCodeableConcept?.coding?.[0]?.code) as string[];
  return targets;
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

function updateAnswerArray(
  answers: QuestionnaireResponseItemAnswer[],
  index: number,
  newResponseAnswer: QuestionnaireResponseItemAnswer
): QuestionnaireResponseItemAnswer[] {
  if (index < answers.length) {
    answers[index] = newResponseAnswer;
    return answers;
  } else {
    for (let i = answers.length; i < index; i++) {
      answers.push({});
    }
    answers.push(newResponseAnswer);
    return answers;
  }
}

function getResponseId(responses: QuestionnaireResponseItem[], index: number): string {
  if (responses.length === 0 || responses.length < index + 1) {
    return generateId();
  }
  return responses[index].id as string;
}

function convertToDesiredFormat(item: QuestionnaireItem): any {
  if (item.answerOption?.length === 0) {
    return undefined;
  }
  const option = (item.answerOption as QuestionnaireItemAnswerOption[])[0];
  const optionValue = getTypedPropertyValue(
    { type: 'QuestionnaireItemAnswerOption', value: option },
    'value'
  ) as TypedValue;
  const propertyName = 'value' + capitalize(optionValue.type);

  const data = (item.answerOption ?? []).map((a) => ({
    value:
      propertyName === 'valueCoding' ? a.valueCoding?.code : a[propertyName as keyof QuestionnaireItemAnswerOption],
    label:
      propertyName === 'valueCoding' ? a.valueCoding?.display : a[propertyName as keyof QuestionnaireItemAnswerOption],
  }));
  return { propertyName, data };
}

function defaultValueById(answers: Record<string, QuestionnaireResponseItemAnswer[]>, item: QuestionnaireItem): any {
  for (const answer in answers) {
    if (answer === item.id) {
      const answerValue = answers[answer][0];
      const itemValue = getTypedPropertyValue(
        { type: 'QuestionnaireItemAnswerOption', value: answerValue },
        'value'
      ) as TypedValue;
      if (itemValue?.type === 'Coding') {
        return itemValue?.value?.code;
      }
      return itemValue?.value;
    }
  }
}
