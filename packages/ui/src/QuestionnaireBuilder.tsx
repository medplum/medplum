import { Questionnaire, QuestionnaireItem, Reference } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { QuestionnaireFormItem } from './QuestionnaireForm';
import { QuestionnaireItemType } from './QuestionnaireUtils';
import { TextField } from './TextField';
import { useResource } from './useResource';
import { killEvent } from './utils/dom';
import './QuestionnaireBuilder.css';

export interface QuestionnaireBuilderProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  onSubmit: (result: Questionnaire) => void;
}

export function QuestionnaireBuilder(props: QuestionnaireBuilderProps) {
  const defaultValue = useResource(props.questionnaire);
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
    setValue(ensureQuestionnaireKeys(defaultValue ?? { resourceType: 'Questionnaire' }));
    document.addEventListener('mouseover', handleDocumentMouseOver);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('mouseover', handleDocumentMouseOver);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [defaultValue]);

  if (!value) {
    return null;
  }

  return (
    <div className="medplum-questionnaire-builder">
      <Form testid="questionnaire-form" onSubmit={() => props.onSubmit(value)}>
        <ItemBuilder
          item={value}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          hoverKey={hoverKey}
          setHoverKey={setHoverKey}
          onChange={setValue}
        />
        <Button type="submit" size="large">
          OK
        </Button>
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

function ItemBuilder<T extends Questionnaire | QuestionnaireItem>(props: ItemBuilderProps<T>) {
  const resource = props.item as Questionnaire;
  const item = props.item as QuestionnaireItem;
  const isResource = 'resourceType' in props.item;
  const isContainer = isResource || item.type === QuestionnaireItemType.group;
  const linkId = item.linkId ?? '[untitled]';
  const editing = props.selectedKey === (props.item as any).__key;
  const hovering = props.hoverKey === (props.item as any).__key;

  const itemRef = useRef<T>();
  itemRef.current = props.item;

  function onClick(e: React.SyntheticEvent): void {
    killEvent(e);
    props.setSelectedKey((props.item as any).__key);
  }

  function onHover(e: React.SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey((props.item as any).__key);
  }

  function changeItem(changedItem: QuestionnaireItem) {
    const curr = itemRef.current as T;
    props.onChange({
      ...curr,
      item: curr.item?.map((i) => ((i as any).__key === (changedItem as any).__key ? changedItem : i)),
    } as T);
  }

  function addItem(addedItem: QuestionnaireItem) {
    props.onChange({
      ...props.item,
      item: [...(props.item?.item ?? []), addedItem],
    });
  }

  function removeItem(removedItem: QuestionnaireItem) {
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

  const className = editing ? 'section editing' : hovering ? 'section hovering' : 'section';
  return (
    <div className={className} onClick={onClick} onMouseOver={onHover}>
      {editing ? (
        <>
          {isResource && (
            <div>
              <input
                type="text"
                defaultValue={resource.title}
                onChange={(e) => changeProperty('title', e.target.value)}
              />
            </div>
          )}
          {!isContainer && (
            <div>
              <select defaultValue={item.type} onChange={(e) => changeProperty('type', e.target.value)}>
                <option value="display">Display</option>
                <optgroup label="Question">
                  <option value="boolean">Boolean</option>
                  <option value="decimal">Decimal</option>
                  <option value="integer">Integer</option>
                  <option value="date">Date</option>
                  <option value="dateTime">Date/Time</option>
                  <option value="time">Time</option>
                  <option value="string">String</option>
                  <option value="text">Text</option>
                  <option value="url">URL</option>
                  <option value="choice">Choice</option>
                  <option value="open-choice">Open Choice</option>
                  <option value="attachment">Attachment</option>
                  <option value="reference">Reference</option>
                  <option value="quantity">Quantity</option>
                </optgroup>
              </select>
            </div>
          )}
          {!isResource && (
            <FormSection>
              {item.type === 'display' ? (
                <textarea defaultValue={item.text} onChange={(e) => changeProperty('text', e.target.value)} />
              ) : (
                <TextField defaultValue={item.text} onChange={(e) => changeProperty('text', e.target.value)} />
              )}
            </FormSection>
          )}
        </>
      ) : (
        <>
          {resource.title && <h1>{resource.title}</h1>}
          {item.text && <p>{item.text}</p>}
          {!isContainer && <QuestionnaireFormItem item={item} />}
        </>
      )}
      {item.item &&
        item.item.map((i) => (
          <div key={(i as any).__key}>
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
        <div className="top-actions">
          {editing ? (
            <input
              type="text"
              defaultValue={item.linkId}
              onChange={(e) => changeProperty('linkId', e.target.value)}
              size={4}
            />
          ) : (
            <div>{linkId}</div>
          )}
        </div>
      )}
      <div className="bottom-actions">
        {isContainer && (
          <>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                addItem({
                  __key: generateKey(),
                  linkId: generateKey(),
                  type: 'string',
                  text: 'Question',
                } as QuestionnaireItem);
              }}
            >
              Add item
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                addItem({
                  __key: generateKey(),
                  linkId: generateKey(),
                  type: 'group',
                  text: 'Group',
                } as QuestionnaireItem);
              }}
            >
              Add group
            </a>
          </>
        )}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (props.onRemove) {
              props.onRemove();
            }
          }}
        >
          Remove
        </a>
      </div>
    </div>
  );
}

let nextKeyId = 1;

/**
 * Generates a short unique key that can be used for local identifiers.
 * @return A unique key.
 */
function generateKey(): string {
  return 'key' + nextKeyId++;
}

function ensureQuestionnaireKeys(questionnaire: Questionnaire): Questionnaire {
  return {
    ...questionnaire,
    item: ensureQuestionnaireItemKeys(questionnaire.item),
    __key: generateKey(),
  } as Questionnaire;
}

function ensureQuestionnaireItemKeys(items: QuestionnaireItem[] | undefined): QuestionnaireItem[] | undefined {
  if (!items) {
    return undefined;
  }
  return items.map((item) => ({
    ...item,
    item: ensureQuestionnaireItemKeys(item.item),
    __key: generateKey(),
  }));
}
