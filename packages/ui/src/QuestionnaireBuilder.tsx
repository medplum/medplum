import { Questionnaire, QuestionnaireItem, Reference } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { QuestionnaireItemType } from '.';
import { Button } from './Button';
import { Form } from './Form';
import { useResource } from './useResource';
import './QuestionnaireBuilder.css';

export interface QuestionnaireBuilderProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  onSubmit: (result: Questionnaire) => void;
}

export function QuestionnaireBuilder(props: QuestionnaireBuilderProps) {
  const defaultValue = useResource(props.questionnaire);
  const [value, setValue] = useState<Questionnaire>();
  const [selectedKey, setSelectedKey] = useState<string>();

  useEffect(() => {
    setValue(ensureQuestionnaireKeys(defaultValue ?? { resourceType: 'Questionnaire' }));
  }, [defaultValue]);

  if (!value) {
    return null;
  }

  return (
    <div className="medplum-questionnaire-builder">
      <Form
        testid="questionnaire-form"
        onSubmit={() => props.onSubmit(value)}>
        <ItemBuilder
          item={value}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          onChange={setValue}
        />
        <Button type="submit" size="large">OK</Button>
      </Form>
    </div>
  );
}

interface ItemBuilderProps<T extends Questionnaire | QuestionnaireItem> {
  item: T;
  selectedKey: string | undefined;
  setSelectedKey: (key: string | undefined) => void;
  onChange: (item: T) => void;
  onRemove?: () => void;
}

function ItemBuilder<T extends Questionnaire | QuestionnaireItem>(props: ItemBuilderProps<T>) {
  const resource = props.item as Questionnaire;
  const item = props.item as QuestionnaireItem;
  const isResource = 'resourceType' in props.item;
  const isContainer = isResource || item.type === QuestionnaireItemType.group;
  const title = (isResource ? resource.title : item.text) ?? '[untitled]';
  const linkId = item.linkId ?? '[untitled]';
  const editing = props.selectedKey === (props.item as any).__key;

  const itemRef = useRef<T>();
  itemRef.current = props.item;

  function onClick(e: React.SyntheticEvent): void {
    e.stopPropagation();
    e.preventDefault();
    props.setSelectedKey((props.item as any).__key);
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
      item: props.item?.item?.filter(i => i !== removedItem)
    });
  }

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...itemRef.current,
      [property]: value,
    } as T);
  }

  const className = editing ? 'section editing' : 'section';
  return (
    <div className={className} onClick={onClick}>
      {editing ? (
        <>
          {isResource && (
            <input
              type="text"
              defaultValue={resource.title}
              onChange={(e) => changeProperty('title', e.target.value)}
            />
          )}
          {!isContainer && (
            <input
              type="text"
              defaultValue={item.linkId}
              onChange={(e) => changeProperty('linkId', e.target.value)}
              size={4}
            />
          )}
          {!isResource && (
            <input
              type="text"
              defaultValue={item.text}
              onChange={(e) => changeProperty('text', e.target.value)}
            />
          )}
          {!isContainer && (
            <>
              <br />
              <select
                defaultValue={item.type}
                onChange={(e) => changeProperty('type', e.target.value)}
              >
                <option>display</option>
                <optgroup label="question">
                  <option>boolean</option>
                  <option>decimal</option>
                  <option>integer</option>
                  <option>date</option>
                  <option>dateTime</option>
                  <option>time</option>
                  <option>string</option>
                  <option>text</option>
                  <option>url</option>
                  <option>choice</option>
                  <option>open-choice</option>
                  <option>attachment</option>
                  <option>reference</option>
                  <option>quantity</option>
                </optgroup>
              </select>
            </>
          )}
        </>
      ) : (
        <>
          {!isContainer && (<span>[{linkId}]&nbsp;</span>)}
          {title}
          {!isContainer && (<p>{item.type}</p>)}
        </>
      )}
      {item.item && item.item.map(i => (
        <div key={(i as any).__key}>
          <ItemBuilder
            item={i}
            selectedKey={props.selectedKey}
            setSelectedKey={props.setSelectedKey}
            onChange={changeItem}
            onRemove={() => removeItem(i)}
          />
        </div>
      ))}
      {editing && props.onRemove && (<div className="top-actions">
        <a href="#" onClick={e => {
          e.preventDefault();
          if (props.onRemove) {
            props.onRemove();
          }
        }}>Remove</a>
      </div>)}
      {editing && isContainer && (
        <div className="bottom-actions">
          <a href="#" onClick={e => {
            e.preventDefault();
            addItem({
              __key: generateKey(),
              linkId: generateKey(),
              type: 'string',
              text: 'Question'
            } as QuestionnaireItem);
          }}>Add item</a>
          <a href="#" onClick={e => {
            e.preventDefault();
            addItem({
              __key: generateKey(),
              linkId: generateKey(),
              type: 'group',
              text: 'Group'
            } as QuestionnaireItem);
          }}>Add group</a>
        </div>
      )}
    </div>
  );
}

let nextKeyId = 1;

/**
 * Generates a short unique key that can be used for local identifiers.
 * @return A unique key.
*/
function generateKey(): string {
  return 'key' + (nextKeyId++);
}

function ensureQuestionnaireKeys(questionnaire: Questionnaire): Questionnaire {
  return {
    ...questionnaire,
    item: ensureQuestionnaireItemKeys(questionnaire.item),
    __key: generateKey()
  } as Questionnaire;
}

function ensureQuestionnaireItemKeys(items: QuestionnaireItem[] | undefined): QuestionnaireItem[] | undefined {
  if (!items) {
    return undefined;
  }
  return items.map(item => ({
    ...item,
    item: ensureQuestionnaireItemKeys(item.item),
    __key: generateKey()
  }));
}
