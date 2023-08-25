import {
  Button,
  Checkbox,
  Group,
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
  getExtension,
  getQuestionnaireAnswers,
  getReferenceString,
  getTypedPropertyValue,
  globalSchema,
  IndexedStructureDefinition,
  ProfileResource,
  PropertyType,
  stringify,
  TypedValue,
  evalFhirPathTyped,
} from '@medplum/core';
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
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
  const [answers, setAnswers] = useState<Record<string, QuestionnaireResponseItemAnswer>>({});
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
    setAnswers(getQuestionnaireAnswers(newResponse));
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
          items={questionnaire.item}
          answers={answers}
          onChange={setItems}
          activePage={activePage}
          renderPages={numberOfPages > 0}
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
  answers: Record<string, QuestionnaireResponseItemAnswer>;
  renderPages?: boolean;
  activePage?: number;
  onChange: (newResponseItems: QuestionnaireResponseItem[]) => void;
}

function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  const [responseItems, setResponseItems] = useState<QuestionnaireResponseItem[]>(
    buildInitialResponseItems(props.items)
  );

  function setResponseItem(index: number, newResponseItem: QuestionnaireResponseItem): void {
    const newResponseItems = responseItems.slice();
    newResponseItems[index] = newResponseItem;
    setResponseItems(newResponseItems);
    props.onChange(newResponseItems);
  }

  const questionForm = props.items.map((item, index) => {
    if (props.renderPages) {
      return (
        <Stepper.Step label={item.text} key={item.linkId}>
          <QuestionnaireFormArrayContent
            key={item.linkId}
            item={item}
            index={index}
            answers={props.answers}
            setResponseItem={setResponseItem}
          />
        </Stepper.Step>
      );
    }
    return (
      <QuestionnaireFormArrayContent
        key={item.linkId}
        item={item}
        index={index}
        answers={props.answers}
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
  answers: Record<string, QuestionnaireResponseItemAnswer>;
  setResponseItem: (index: number, newResponseItem: QuestionnaireResponseItem) => void;
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
      <QuestionnaireFormItem
        key={props.item.linkId}
        item={props.item}
        answers={props.answers}
        onChange={(newResponseItem) => props.setResponseItem(props.index, newResponseItem)}
      />
    );
  }
  if (props.item.type === QuestionnaireItemType.boolean) {
    const initial = props.item.initial && props.item.initial.length > 0 ? props.item.initial[0] : undefined;
    return (
      <CheckboxFormSection key={props.item.linkId} title={props.item.text} htmlFor={props.item.linkId}>
        <Checkbox
          id={props.item.linkId}
          name={props.item.linkId}
          defaultChecked={initial?.valueBoolean}
          onChange={(e) =>
            props.setResponseItem(props.index, {
              linkId: props.item.linkId,
              text: props.item.text,
              answer: [{ valueBoolean: e.currentTarget.checked }],
            })
          }
        />
      </CheckboxFormSection>
    );
  }
  return (
    <FormSection key={props.item.linkId} htmlFor={props.item.linkId} title={props.item.text ?? ''}>
      <QuestionnaireFormItem
        item={props.item}
        answers={props.answers}
        onChange={(newResponseItem) => props.setResponseItem(props.index, newResponseItem)}
      />
    </FormSection>
  );
}

export interface QuestionnaireFormItemProps {
  item: QuestionnaireItem;
  answers: Record<string, QuestionnaireResponseItemAnswer>;
  onChange: (newResponseItem: QuestionnaireResponseItem) => void;
}

export function QuestionnaireFormItem(props: QuestionnaireFormItemProps): JSX.Element | null {
  const item = props.item;

  const type = item.type as QuestionnaireItemType;
  if (!type) {
    return null;
  }

  const name = item.linkId;
  if (!name) {
    return null;
  }

  const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;

  function onChangeItem(newResponseItems: QuestionnaireResponseItem[]): void {
    props.onChange({
      linkId: item.linkId,
      text: item.text,
      item: newResponseItems,
    });
  }

  function onChangeAnswer(newResponseAnswer: QuestionnaireResponseItemAnswer): void {
    props.onChange({
      linkId: item.linkId,
      text: item.text,
      answer: [newResponseAnswer],
    });
  }

  switch (type) {
    case QuestionnaireItemType.group:
      return (
        <div>
          <h3>{item.text}</h3>
          {item.item && (
            <QuestionnaireFormItemArray items={item.item} answers={props.answers} onChange={onChangeItem} />
          )}
        </div>
      );
    case QuestionnaireItemType.boolean:
      return (
        <Checkbox
          id={name}
          name={name}
          defaultChecked={initial?.valueBoolean}
          onChange={(e) => onChangeAnswer({ valueBoolean: e.currentTarget.checked })}
        />
      );
    case QuestionnaireItemType.decimal:
      return (
        <TextInput
          type="number"
          step="any"
          id={name}
          name={name}
          defaultValue={initial?.valueDecimal}
          onChange={(e) => onChangeAnswer({ valueDecimal: e.currentTarget.valueAsNumber })}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <TextInput
          type="number"
          step={1}
          id={name}
          name={name}
          defaultValue={initial?.valueInteger}
          onChange={(e) => onChangeAnswer({ valueInteger: e.currentTarget.valueAsNumber })}
        />
      );
    case QuestionnaireItemType.date:
      return (
        <TextInput
          type="date"
          id={name}
          name={name}
          defaultValue={initial?.valueDate}
          onChange={(e) => onChangeAnswer({ valueDate: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          name={name}
          defaultValue={initial?.valueDateTime}
          onChange={(newValue: string) => onChangeAnswer({ valueDateTime: newValue })}
        />
      );
    case QuestionnaireItemType.time:
      return (
        <TextInput
          type="time"
          id={name}
          name={name}
          defaultValue={initial?.valueTime}
          onChange={(e) => onChangeAnswer({ valueTime: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return (
        <TextInput
          id={name}
          name={name}
          defaultValue={initial?.valueString}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.text:
      return (
        <Textarea
          id={name}
          name={name}
          defaultValue={initial?.valueString}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.attachment:
      return (
        <AttachmentInput
          name={name}
          defaultValue={initial?.valueAttachment}
          onChange={(newValue) => onChangeAnswer({ valueAttachment: newValue })}
        />
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput
          name={name}
          targetTypes={addTargetTypes(item)}
          defaultValue={initial?.valueReference}
          onChange={(newValue) => onChangeAnswer({ valueReference: newValue })}
        />
      );
    case QuestionnaireItemType.quantity:
      return (
        <QuantityInput
          name={name}
          defaultValue={initial?.valueQuantity}
          onChange={(newValue) => onChangeAnswer({ valueQuantity: newValue })}
          disableWheel
        />
      );
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item)) {
        return (
          <QuestionnaireChoiceDropDownInput name={name} item={item} initial={initial} onChangeAnswer={onChangeAnswer} />
        );
      } else {
        return (
          <QuestionnaireChoiceRadioInput name={name} item={item} initial={initial} onChangeAnswer={onChangeAnswer} />
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
  onChangeAnswer: (newResponseAnswer: QuestionnaireResponseItemAnswer) => void;
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
      defaultValue={typedValueToString(initialValue)}
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
    linkId: item.linkId,
    text: item.text,
    item: buildInitialResponseItems(item.item),
    answer: item.initial?.map(buildInitialResponseAnswer) ?? [],
  };
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
  answers: Record<string, QuestionnaireResponseItemAnswer>
): boolean {
  if (!item.enableWhen) {
    return true;
  }

  const enableBehavior = item.enableBehavior ?? 'any';

  for (const enableWhen of item.enableWhen) {
    const actualAnswer = getTypedPropertyValue(
      {
        type: 'QuestionnaireResponseItemAnswer',
        value: answers[enableWhen.question as string],
      },
      'value[x]'
    ) as TypedValue | undefined; // possibly undefined when question unanswered

    const expectedAnswer = getTypedPropertyValue(
      {
        type: 'QuestionnaireItemEnableWhen',
        value: enableWhen,
      },
      'answer[x]'
    ) as TypedValue;

    let match: boolean;

    const { operator } = enableWhen;

    // We handle exists separately since its so different in terms of comparisons than the other mathematical operators
    if (operator === 'exists') {
      // if actualAnswer is not undefined, then exists: true passes
      // if actualAnswer is undefined, then exists: false passes
      match = !!actualAnswer === expectedAnswer.value;
    } else if (actualAnswer === undefined) {
      match = false;
    } else {
      // `=` and `!=` should be treated as the FHIRPath `~` and `!~`
      // All other operators should be unmodified
      const fhirPathOperator = operator === '=' || operator === '!=' ? operator?.replace('=', '~') : operator;
      const [{ value }] = evalFhirPathTyped(`%actualAnswer ${fhirPathOperator} %expectedAnswer`, [actualAnswer], {
        actualAnswer,
        expectedAnswer,
      });
      match = value;
    }

    if (enableBehavior === 'any' && match) {
      return true;
    }
    if (enableBehavior === 'all' && !match) {
      return false;
    }
  }
  if (enableBehavior === 'any') {
    return false;
  } else {
    return true;
  }
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
