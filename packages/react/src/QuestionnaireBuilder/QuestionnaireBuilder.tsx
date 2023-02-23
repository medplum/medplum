import { Anchor, Button, createStyles, NativeSelect, Textarea, TextInput, Title } from '@mantine/core';
import { globalSchema, IndexedStructureDefinition, isResource as isResourceType } from '@medplum/core';
import { Questionnaire, QuestionnaireItem, QuestionnaireItemAnswerOption, Reference } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Form } from '../Form/Form';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { QuestionnaireFormItem } from '../QuestionnaireForm/QuestionnaireForm';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { useResource } from '../useResource/useResource';
import { killEvent } from '../utils/dom';
import { isChoiceQuestion, QuestionnaireItemType } from '../utils/questionnaire';

const useStyles = createStyles((theme) => ({
  section: {
    position: 'relative',
    margin: '4px 4px 8px 0',
    padding: '6px 12px 16px 6px',
    border: `1.5px solid ${theme.colors.gray[1]}`,
    borderRadius: theme.radius.sm,
    transition: 'all 0.1s',
  },

  hovering: {
    border: `1.5px solid ${theme.colors.blue[5]}`,
  },

  editing: {
    border: `1.5px solid ${theme.colors.gray[1]}`,
    borderLeft: `4px solid ${theme.colors.blue[5]}`,
  },

  questionBody: {
    maxWidth: 600,
  },

  topActions: {
    position: 'absolute',
    right: 4,
    top: 1,
    padding: 4,
    color: theme.colors.gray[5],
    fontSize: theme.fontSizes.xs,
  },

  bottomActions: {
    position: 'absolute',
    right: 4,
    bottom: 0,
    fontSize: theme.fontSizes.xs,

    '& a': {
      marginLeft: 8,
    },
  },

  linkIdInput: {
    width: 100,
    marginBottom: 4,
  },

  typeSelect: {
    width: 100,
  },
}));

export interface QuestionnaireBuilderProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  onSubmit: (result: Questionnaire) => void;
}

export function QuestionnaireBuilder(props: QuestionnaireBuilderProps): JSX.Element | null {
  const medplum = useMedplum();
  const defaultValue = useResource(props.questionnaire);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
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
    medplum.requestSchema('Questionnaire').then(setSchema).catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setValue(ensureQuestionnaireKeys(defaultValue ?? { resourceType: 'Questionnaire' }));
    document.addEventListener('mouseover', handleDocumentMouseOver);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('mouseover', handleDocumentMouseOver);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [defaultValue]);

  if (!schema || !value) {
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
          onChange={setValue}
        />
        <Button type="submit">Save</Button>
      </Form>
    </div>
  );
}

interface ItemBuilderProps<T extends Questionnaire | QuestionnaireItem> {
  item: T;
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  hoverKey: string | undefined;
  setHoverKey: (key: string | undefined) => void;
  onChange: (item: T) => void;
  onRemove?: () => void;
}

function ItemBuilder<T extends Questionnaire | QuestionnaireItem>(props: ItemBuilderProps<T>): JSX.Element {
  const { classes, cx } = useStyles();
  const resource = props.item as Questionnaire;
  const item = props.item as QuestionnaireItem;
  const isResource = isResourceType(props.item);
  const isContainer = isResource || item.type === QuestionnaireItemType.group;
  const linkId = item.linkId ?? '[untitled]';
  const editing = props.selectedKey === props.item.id;
  const hovering = props.hoverKey === props.item.id;

  const itemRef = useRef<T>();
  itemRef.current = props.item;

  function onClick(e: React.SyntheticEvent): void {
    killEvent(e);
    props.setSelectedKey(props.item.id);
  }

  function onHover(e: React.SyntheticEvent): void {
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

  function addItem(addedItem: QuestionnaireItem): void {
    props.onChange({
      ...props.item,
      item: [...(props.item?.item ?? []), addedItem],
    });
  }

  function removeItem(removedItem: QuestionnaireItem): void {
    props.onChange({
      ...props.item,
      item: props.item?.item?.filter((i) => i !== removedItem),
    });
  }

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...itemRef.current,
      [property]: value,
    } as T);
  }

  const className = cx(classes.section, {
    [classes.editing]: editing,
    [classes.hovering]: hovering && !editing,
  });

  return (
    <div data-testid={item.linkId} className={className} onClick={onClick} onMouseOver={onHover}>
      <div className={classes.questionBody}>
        {editing ? (
          <>
            {isResource && (
              <TextInput
                size="xl"
                defaultValue={resource.title}
                onChange={(e) => changeProperty('title', e.currentTarget.value)}
              />
            )}
            {!isResource && (
              <Textarea
                autosize
                minRows={2}
                defaultValue={item.text}
                onChange={(e) => changeProperty('text', e.currentTarget.value)}
              />
            )}
            {isChoiceQuestion(item) && (
              <AnswerBuilder
                options={item.answerOption}
                onChange={(newOptions) => changeProperty('answerOption', newOptions)}
              />
            )}
          </>
        ) : (
          <>
            {resource.title && <Title>{resource.title}</Title>}
            {item.text && <div>{item.text}</div>}
            {!isContainer && <QuestionnaireFormItem item={item} answers={{}} onChange={() => undefined} />}
          </>
        )}
      </div>
      {item.item &&
        item.item.map((i) => (
          <div key={i.id}>
            <ItemBuilder
              item={i}
              selectedKey={props.selectedKey}
              setSelectedKey={props.setSelectedKey}
              hoverKey={props.hoverKey}
              setHoverKey={props.setHoverKey}
              onChange={changeItem}
              onRemove={() => removeItem(i)}
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
                onChange={(e) => changeProperty('linkId', e.currentTarget.value)}
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
      <div className={classes.bottomActions}>
        {isContainer && (
          <>
            <Anchor
              href="#"
              onClick={(e: React.MouseEvent) => {
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
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                addItem({
                  id: generateId(),
                  linkId: generateLinkId('g'),
                  type: 'group',
                  text: 'Group',
                } as QuestionnaireItem);
              }}
            >
              Add group
            </Anchor>
          </>
        )}
        {editing && !isResource && (
          <Anchor
            href="#"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              if (props.onRemove) {
                props.onRemove();
              }
            }}
          >
            Remove
          </Anchor>
        )}
      </div>
    </div>
  );
}

interface AnswerBuilderProps {
  options?: QuestionnaireItemAnswerOption[];
  onChange: (newOptions: QuestionnaireItemAnswerOption[]) => void;
}

function AnswerBuilder(props: AnswerBuilderProps): JSX.Element {
  const property = globalSchema.types['QuestionnaireItemAnswerOption'].properties['value[x]'];
  const options = props.options ?? [];
  return (
    <div>
      {options.map((option: QuestionnaireItemAnswerOption) => {
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
                property={property}
                defaultPropertyType={propertyType}
                defaultValue={propertyValue}
                onChange={(newValue: any, propName?: string) => {
                  const newOptions = [...options];
                  const index = newOptions.findIndex((o) => o.id === option.id);
                  newOptions[index] = { id: option.id, [propName as string]: newValue };
                  props.onChange(newOptions);
                }}
              />
            </div>
            <div>
              <Anchor
                href="#"
                onClick={(e: React.SyntheticEvent) => {
                  killEvent(e);
                  props.onChange(options.filter((o) => o.id !== option.id));
                }}
              >
                Remove
              </Anchor>
            </div>
          </div>
        );
      })}
      <Anchor
        href="#"
        onClick={(e: React.SyntheticEvent) => {
          killEvent(e);
          props.onChange([
            ...options,
            {
              id: generateId(),
            },
          ]);
        }}
      >
        Add choice
      </Anchor>
    </div>
  );
}

let nextLinkId = 1;
let nextId = 1;

/**
 * Generates a link ID for an item.
 * Link IDs are required properties on QuestionnaireItem objects.
 * @return A unique link ID.
 */
function generateLinkId(prefix: string): string {
  return prefix + nextLinkId++;
}

/**
 * Generates a unique ID.
 * React needs unique IDs for components for rendering performance.
 * All of the important components in the questionnaire builder have id properties for this:
 * Questionnaire, QuestionnaireItem, and QuestionnaireItemAnswerOption.
 * @return A unique key.
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
      nextId = Math.max(nextId, parseInt(item.id.substring(3)) + 1);
    }
    if (item.linkId?.match(/^q\d+$/)) {
      nextLinkId = Math.max(nextLinkId, parseInt(item.linkId.substring(1)) + 1);
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
