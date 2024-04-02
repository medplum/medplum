import { Anchor, Box, Button, Group, NativeSelect, Space, Textarea, TextInput, Title } from '@mantine/core';
import { getElementDefinition, isResource as isResourceType } from '@medplum/core';
import {
  Extension,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import cx from 'clsx';
import { MouseEvent, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Form } from '../Form/Form';
import { QuestionnaireFormItem } from '../QuestionnaireForm/QuestionnaireFormItem/QuestionnaireFormItem';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { ResourceTypeInput } from '../ResourceTypeInput/ResourceTypeInput';
import { killEvent } from '../utils/dom';
import {
  getQuestionnaireItemReferenceTargetTypes,
  isChoiceQuestion,
  QuestionnaireItemType,
  setQuestionnaireItemReferenceTargetTypes,
} from '../utils/questionnaire';
import classes from './QuestionnaireBuilder.module.css';

export interface QuestionnaireBuilderProps {
  readonly questionnaire: Partial<Questionnaire> | Reference<Questionnaire>;
  readonly onSubmit: (result: Questionnaire) => void;
  readonly autoSave?: boolean;
}

export function QuestionnaireBuilder(props: QuestionnaireBuilderProps): JSX.Element | null {
  const medplum = useMedplum();
  const defaultValue = useResource(props.questionnaire);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [value, setValue] = useState<Questionnaire>();
  const [selectedKey, setSelectedKey] = useState<string>();
  const [hoverKey, setHoverKey] = useState<string>();

  function handleDocumentMouseOver(): void {
    setHoverKey(undefined);
  }

  function handleDocumentClick(): void {
    setSelectedKey(undefined);
  }

  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setValue(ensureQuestionnaireKeys(defaultValue ?? { resourceType: 'Questionnaire', status: 'active' }));
    document.addEventListener('mouseover', handleDocumentMouseOver);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('mouseover', handleDocumentMouseOver);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [defaultValue]);

  const handleChange = (questionnaire: Questionnaire, disableSubmit?: boolean): void => {
    setValue(questionnaire);
    if (props.autoSave && !disableSubmit && props.onSubmit) {
      props.onSubmit(questionnaire);
    }
  };

  if (!schemaLoaded || !value) {
    return null;
  }

  return (
    <div>
      <Form testid="questionnaire-form" onSubmit={() => props.onSubmit(value)}>
        <ItemBuilder
          item={value}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          hoverKey={hoverKey}
          setHoverKey={setHoverKey}
          onChange={handleChange}
        />
        <Button type="submit">Save</Button>
      </Form>
    </div>
  );
}

interface ItemBuilderProps<T extends Questionnaire | QuestionnaireItem> {
  readonly item: T;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly isFirst?: boolean;
  readonly isLast?: boolean;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (item: T, disableSubmit?: boolean) => void;
  readonly onRemove?: () => void;
  readonly onRepeatable?: (item: QuestionnaireItem) => void;
  onMoveUp?(): void;
  onMoveDown?(): void;
}

function ItemBuilder<T extends Questionnaire | QuestionnaireItem>(props: ItemBuilderProps<T>): JSX.Element {
  const resource = props.item as Questionnaire;
  const item = props.item as QuestionnaireItem;
  const isResource = isResourceType(props.item);
  const isContainer = isResource || item.type === QuestionnaireItemType.group;
  const linkId = item.linkId ?? '[untitled]';
  const editing = props.selectedKey === props.item.id;
  const hovering = props.hoverKey === props.item.id;

  const itemRef = useRef<T>();
  itemRef.current = props.item;

  function onClick(e: SyntheticEvent): void {
    killEvent(e);
    props.setSelectedKey(props.item.id);
  }

  function onHover(e: SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey(props.item.id);
  }

  function changeItem(changedItem: QuestionnaireItem): void {
    const curr = itemRef.current as T;
    props.onChange({
      ...curr,
      item: curr.item?.map((i) => (i.id === changedItem.id ? changedItem : i)),
    } as T);
  }

  function addItem(addedItem: QuestionnaireItem, disableSubmit?: boolean): void {
    props.onChange(
      {
        ...props.item,
        item: [...(props.item.item ?? []), addedItem],
      },
      disableSubmit
    );
  }

  function removeItem(removedItem: QuestionnaireItem): void {
    props.onChange({
      ...props.item,
      item: props.item.item?.filter((i) => i !== removedItem),
    });
  }

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...itemRef.current,
      [property]: value,
    } as T);
  }

  function updateItem(updatedItem: QuestionnaireItem): void {
    props.onChange({
      ...props.item,
      ...updatedItem,
    });
  }

  function toggleRepeatable(item: QuestionnaireItem): void {
    props.onChange({
      ...props.item,
      item: props.item.item?.map((i) => (i === item ? { ...i, repeats: !i.repeats } : i)),
    });
  }

  function moveItem(itemIndex: number, delta: number): void {
    const updatedItems = reorderItems(props.item.item, itemIndex, delta);

    props.onChange({
      ...props.item,
      item: updatedItems,
    });
  }

  const className = cx(classes.section, {
    [classes.editing]: editing,
    [classes.hovering]: hovering && !editing,
  });

  return (
    <div data-testid={item.linkId} className={className} onClick={onClick} onMouseOver={onHover} onFocus={onHover}>
      <div className={classes.questionBody}>
        {editing ? (
          <>
            {isResource && (
              <TextInput
                size="xl"
                defaultValue={resource.title}
                onBlur={(e) => changeProperty('title', e.currentTarget.value)}
              />
            )}
            {!isResource && (
              <Textarea
                autosize
                minRows={2}
                defaultValue={item.text}
                onBlur={(e) => changeProperty('text', e.currentTarget.value)}
              />
            )}
            {item.type === 'reference' && <ReferenceProfiles item={item} onChange={updateItem} />}
            {isChoiceQuestion(item) && <AnswerBuilder item={item} onChange={(item) => updateItem(item)} />}
          </>
        ) : (
          <>
            {resource.title && <Title>{resource.title}</Title>}
            {item.text && <div>{item.text}</div>}
            {!isContainer && (
              <QuestionnaireFormItem
                item={item}
                index={0}
                onChange={() => undefined}
                response={{ linkId: item.linkId }}
              />
            )}
          </>
        )}
      </div>
      {item.item?.map((item, i) => (
        <div key={item.id}>
          <ItemBuilder
            item={item}
            selectedKey={props.selectedKey}
            setSelectedKey={props.setSelectedKey}
            hoverKey={props.hoverKey}
            isFirst={i === 0}
            isLast={i === (props.item.item ?? []).length - 1}
            setHoverKey={props.setHoverKey}
            onChange={changeItem}
            onRemove={() => removeItem(item)}
            onRepeatable={toggleRepeatable}
            onMoveUp={() => moveItem(i, -1)}
            onMoveDown={() => moveItem(i, 1)}
          />
        </div>
      ))}
      {!isContainer && (
        <div className={classes.topActions}>
          {editing ? (
            <>
              <TextInput
                size="xs"
                className={classes.linkIdInput}
                defaultValue={item.linkId}
                onBlur={(e) => changeProperty('linkId', e.currentTarget.value)}
              />
              {!isContainer && (
                <NativeSelect
                  size="xs"
                  className={classes.typeSelect}
                  defaultValue={item.type}
                  onChange={(e) => changeProperty('type', e.currentTarget.value)}
                  data={[
                    { value: 'display', label: 'Display' },
                    { value: 'boolean', label: 'Boolean' },
                    { value: 'decimal', label: 'Decimal' },
                    { value: 'integer', label: 'Integer' },
                    { value: 'date', label: 'Date' },
                    { value: 'dateTime', label: 'Date/Time' },
                    { value: 'time', label: 'Time' },
                    { value: 'string', label: 'String' },
                    { value: 'text', label: 'Text' },
                    { value: 'url', label: 'URL' },
                    { value: 'choice', label: 'Choice' },
                    { value: 'open-choice', label: 'Open Choice' },
                    { value: 'attachment', label: 'Attachment' },
                    { value: 'reference', label: 'Reference' },
                    { value: 'quantity', label: 'Quantity' },
                  ]}
                />
              )}
            </>
          ) : (
            <div>{linkId}</div>
          )}
        </div>
      )}
      {!isResource && (
        <Box className={classes.movementActions}>
          <Box className={classes.columnAlignment}>
            {!props.isFirst && (
              <Anchor
                href="#"
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  if (props.onMoveUp) {
                    props.onMoveUp();
                  }
                }}
              >
                <IconArrowUp data-testid="up-button" size={15} className={classes.movementIcons} />
              </Anchor>
            )}
            {!props.isLast && (
              <Anchor
                href="#"
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  if (props.onMoveDown) {
                    props.onMoveDown();
                  }
                }}
              >
                <IconArrowDown data-testid="down-button" size={15} className={classes.movementIcons} />
              </Anchor>
            )}
          </Box>
        </Box>
      )}
      <div className={classes.bottomActions}>
        {isContainer && (
          <>
            <Anchor
              href="#"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                addItem({
                  id: generateId(),
                  linkId: generateLinkId('q'),
                  type: 'string',
                  text: 'Question',
                } as QuestionnaireItem);
              }}
            >
              Add item
            </Anchor>
            <Anchor
              href="#"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                addItem(
                  {
                    id: generateId(),
                    linkId: generateLinkId('g'),
                    type: 'group',
                    text: 'Group',
                  } as QuestionnaireItem,
                  true
                );
              }}
            >
              Add group
            </Anchor>
          </>
        )}
        {isResource && (
          <Anchor
            href="#"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              addItem(createPage(), true);
            }}
          >
            Add Page
          </Anchor>
        )}
        {editing && !isResource && (
          <>
            <Anchor
              href="#"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                if (props.onRepeatable) {
                  props.onRepeatable(item);
                }
              }}
            >
              {item.repeats ? 'Remove Repeatable' : 'Make Repeatable'}
            </Anchor>
            <Anchor
              href="#"
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                if (props.onRemove) {
                  props.onRemove();
                }
              }}
            >
              Remove
            </Anchor>
          </>
        )}
      </div>
    </div>
  );
}

interface AnswerBuilderProps {
  readonly item: QuestionnaireItem;
  readonly onChange: (item: QuestionnaireItem) => void;
}

function AnswerBuilder(props: AnswerBuilderProps): JSX.Element {
  const property = getElementDefinition('QuestionnaireItemAnswerOption', 'value[x]');
  const options = props.item.answerOption ?? [];
  return (
    <div>
      {props.item.answerValueSet !== undefined ? (
        <TextInput
          placeholder="Enter Value Set"
          defaultValue={props.item.answerValueSet}
          onChange={(e) => props.onChange({ ...props.item, answerValueSet: e.target.value })}
        />
      ) : (
        <AnswerOptionsInput options={options} property={property} item={props.item} onChange={props.onChange} />
      )}
      <Box display="flex">
        <Anchor
          href="#"
          onClick={(e: SyntheticEvent) => {
            killEvent(e);
            props.onChange({
              ...props.item,
              answerValueSet: undefined,
              answerOption: [
                ...options,
                {
                  id: generateId(),
                },
              ],
            });
          }}
        >
          Add choice
        </Anchor>
        <Space w="lg" />
        <Anchor
          href="#"
          onClick={(e: SyntheticEvent) => {
            killEvent(e);
            props.onChange({
              ...props.item,
              answerOption: [],
              answerValueSet: '',
            });
          }}
        >
          Add value set
        </Anchor>
      </Box>
    </div>
  );
}

interface AnswerOptionsInputProps {
  readonly options: QuestionnaireItemAnswerOption[];
  readonly property: any;
  readonly item: QuestionnaireItem;
  readonly onChange: (item: QuestionnaireItem) => void;
}

function AnswerOptionsInput(props: AnswerOptionsInputProps): JSX.Element {
  return (
    <div>
      {props.options.map((option: QuestionnaireItemAnswerOption) => {
        const [propertyValue, propertyType] = getValueAndType(
          { type: 'QuestionnaireItemAnswerOption', value: option },
          'value'
        );
        return (
          <div
            key={option.id}
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '80%',
            }}
          >
            <div>
              <ResourcePropertyInput
                key={option.id}
                name="value[x]"
                path="Questionnaire.answerOption.value[x]"
                property={props.property}
                defaultPropertyType={propertyType}
                defaultValue={propertyValue}
                onChange={(newValue: any, propName?: string) => {
                  const newOptions = [...props.options];
                  const index = newOptions.findIndex((o) => o.id === option.id);
                  newOptions[index] = { id: option.id, [propName as string]: newValue };
                  props.onChange({
                    ...props.item,
                    answerOption: newOptions,
                  });
                }}
                outcome={undefined}
              />
            </div>

            <div>
              <Anchor
                href="#"
                onClick={(e: SyntheticEvent) => {
                  killEvent(e);
                  props.onChange({
                    ...props.item,
                    answerOption: props.options.filter((o) => o.id !== option.id),
                  });
                }}
              >
                Remove
              </Anchor>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ReferenceTypeProps {
  readonly item: QuestionnaireItem;
  readonly onChange: (updatedItem: QuestionnaireItem) => void;
}

function ReferenceProfiles(props: ReferenceTypeProps): JSX.Element {
  const targetTypes = getQuestionnaireItemReferenceTargetTypes(props.item) ?? [];
  return (
    <>
      {targetTypes.map((targetType: ResourceType, index: number) => {
        return (
          <Group key={`${targetType}-${index}`}>
            <ResourceTypeInput
              name="resourceType"
              placeholder="Resource Type"
              defaultValue={targetType}
              onChange={(newValue) => {
                props.onChange(
                  setQuestionnaireItemReferenceTargetTypes(
                    props.item,
                    targetTypes.map((t) => (t === targetType ? (newValue as ResourceType) : t))
                  )
                );
              }}
            />
            <Anchor
              href="#"
              onClick={(e: SyntheticEvent) => {
                killEvent(e);
                props.onChange(
                  setQuestionnaireItemReferenceTargetTypes(
                    props.item,
                    targetTypes.filter((t) => t !== targetType)
                  )
                );
              }}
            >
              Remove
            </Anchor>
          </Group>
        );
      })}
      <Anchor
        href="#"
        onClick={(e: SyntheticEvent) => {
          killEvent(e);
          props.onChange(setQuestionnaireItemReferenceTargetTypes(props.item, [...targetTypes, '' as ResourceType]));
        }}
      >
        Add Resource Type
      </Anchor>
    </>
  );
}

let nextLinkId = 1;
let nextId = 1;

/**
 * Generates a link ID for an item.
 * Link IDs are required properties on QuestionnaireItem objects.
 * @param prefix - The link ID prefix string.
 * @returns A unique link ID.
 */
function generateLinkId(prefix: string): string {
  return prefix + nextLinkId++;
}

/**
 * Generates a unique ID.
 * React needs unique IDs for components for rendering performance.
 * All of the important components in the questionnaire builder have id properties for this:
 * Questionnaire, QuestionnaireItem, and QuestionnaireItemAnswerOption.
 * @returns A unique key.
 */
function generateId(): string {
  return 'id-' + nextId++;
}

function ensureQuestionnaireKeys(questionnaire: Questionnaire): Questionnaire {
  return {
    ...questionnaire,
    id: questionnaire.id || generateId(),
    item: ensureQuestionnaireItemKeys(questionnaire.item),
  } as Questionnaire;
}

function ensureQuestionnaireItemKeys(items: QuestionnaireItem[] | undefined): QuestionnaireItem[] | undefined {
  if (!items) {
    return undefined;
  }
  items.forEach((item) => {
    if (item.id?.match(/^id-\d+$/)) {
      nextId = Math.max(nextId, parseInt(item.id.substring(3), 10) + 1);
    }
    if (item.linkId?.match(/^q\d+$/)) {
      nextLinkId = Math.max(nextLinkId, parseInt(item.linkId.substring(1), 10) + 1);
    }
  });
  return items.map((item) => ({
    ...item,
    id: item.id || generateId(),
    item: ensureQuestionnaireItemKeys(item.item),
    answerOption: ensureQuestionnaireOptionKeys(item.answerOption),
  }));
}

function ensureQuestionnaireOptionKeys(
  options: QuestionnaireItemAnswerOption[] | undefined
): QuestionnaireItemAnswerOption[] | undefined {
  if (!options) {
    return undefined;
  }
  return options.map((option) => ({
    ...option,
    id: option.id || generateId(),
  }));
}

function createPage(): QuestionnaireItem {
  return {
    id: generateId(),
    linkId: generateLinkId('s'),
    type: 'group',
    text: `New Page`,
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://hl7.org/fhir/questionnaire-item-control',
              code: 'page',
            },
          ],
        },
      } as Extension,
    ],
  } as QuestionnaireItem;
}

function reorderItems(items: QuestionnaireItem[] | undefined, itemIndex: number, delta: number): QuestionnaireItem[] {
  const currentItems = items ?? [];
  const newIndex = itemIndex + delta;
  if (newIndex < 0 || newIndex >= currentItems.length) {
    return currentItems;
  }

  const updatedItems = [...currentItems];
  [updatedItems[itemIndex], updatedItems[newIndex]] = [updatedItems[newIndex], updatedItems[itemIndex]];

  return updatedItems;
}
