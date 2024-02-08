import { Anchor, Button, NativeSelect, Stack, TextInput } from '@mantine/core';
import { InternalSchemaElement, getReferenceString } from '@medplum/core';
import { PlanDefinition, PlanDefinitionAction, Reference, ResourceType } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import { MouseEvent, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Form } from '../Form/Form';
import { FormSection } from '../FormSection/FormSection';
import { ReferenceDisplay } from '../ReferenceDisplay/ReferenceDisplay';
import { setPropertyValue } from '../ResourceForm/ResourceForm.utils';
import { ResourceInput } from '../ResourceInput/ResourceInput';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { getValueAndType } from '../ResourcePropertyDisplay/ResourcePropertyDisplay.utils';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { killEvent } from '../utils/dom';
import classes from './PlanDefinitionBuilder.module.css';

export interface PlanDefinitionBuilderProps {
  readonly value: Partial<PlanDefinition> | Reference<PlanDefinition>;
  readonly onSubmit: (result: PlanDefinition) => void;
}

export function PlanDefinitionBuilder(props: PlanDefinitionBuilderProps): JSX.Element | null {
  const medplum = useMedplum();
  const defaultValue = useResource(props.value);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [hoverKey, setHoverKey] = useState<string>();
  const [value, setValue] = useState<PlanDefinition>();

  function handleDocumentMouseOver(): void {
    setHoverKey(undefined);
  }

  function handleDocumentClick(): void {
    setSelectedKey(undefined);
  }

  const valueRef = useRef<PlanDefinition>();
  valueRef.current = value;

  useEffect(() => {
    medplum
      .requestSchema('PlanDefinition')
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setValue(ensurePlanDefinitionKeys(defaultValue ?? { resourceType: 'PlanDefinition', status: 'active' }));
    document.addEventListener('mouseover', handleDocumentMouseOver);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('mouseover', handleDocumentMouseOver);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [defaultValue]);

  if (!schemaLoaded || !value) {
    return null;
  }

  function changeProperty(property: string, newValue: any): void {
    setValue({
      ...valueRef.current,
      [property]: newValue,
    } as PlanDefinition);
  }

  return (
    <div>
      <Form testid="questionnaire-form" onSubmit={() => props.onSubmit(value)}>
        <TextInput
          label="Plan Title"
          defaultValue={value.title}
          onChange={(e) => changeProperty('title', e.currentTarget.value)}
        />
        <ActionArrayBuilder
          actions={value.action || []}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          hoverKey={hoverKey}
          setHoverKey={setHoverKey}
          onChange={(x) => changeProperty('action', x)}
        />
        <Button type="submit">Save</Button>
      </Form>
    </div>
  );
}

interface ActionArrayBuilderProps {
  readonly actions: PlanDefinitionAction[];
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (actions: PlanDefinitionAction[]) => void;
}

function ActionArrayBuilder(props: ActionArrayBuilderProps): JSX.Element {
  const actionsRef = useRef<PlanDefinitionAction[]>();
  actionsRef.current = props.actions;

  function changeAction(changedAction: PlanDefinitionAction): void {
    props.onChange(
      (actionsRef.current as PlanDefinition[]).map((i) => (i.id === changedAction.id ? changedAction : i))
    );
  }

  function addAction(addedAction: PlanDefinitionAction): void {
    props.onChange([...(actionsRef.current as PlanDefinition[]), addedAction]);
    props.setSelectedKey(addedAction.id);
  }

  function removeAction(removedAction: PlanDefinitionAction): void {
    props.onChange((actionsRef.current as PlanDefinition[]).filter((i) => i !== removedAction));
  }

  return (
    <div className={classes.section}>
      {props.actions.map((action) => (
        <div key={action.id}>
          <ActionBuilder
            action={action}
            selectedKey={props.selectedKey}
            setSelectedKey={props.setSelectedKey}
            hoverKey={props.hoverKey}
            setHoverKey={props.setHoverKey}
            onChange={changeAction}
            onRemove={() => removeAction(action)}
          />
        </div>
      ))}
      <div className={classes.bottomActions}>
        <Anchor
          href="#"
          onClick={(e: MouseEvent) => {
            killEvent(e);
            addAction({ id: generateId() });
          }}
        >
          Add action
        </Anchor>
      </div>
    </div>
  );
}

interface ActionBuilderProps {
  readonly action: PlanDefinitionAction;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (action: PlanDefinitionAction) => void;
  readonly onRemove: () => void;
}

function ActionBuilder(props: ActionBuilderProps): JSX.Element {
  const { action } = props;
  const actionType = getInitialActionType(action);
  const editing = props.selectedKey === props.action.id;
  const hovering = props.hoverKey === props.action.id;

  function onClick(e: SyntheticEvent): void {
    e.stopPropagation();
    props.setSelectedKey(props.action.id);
  }

  function onHover(e: SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey(props.action.id);
  }

  const className = cx(classes.section, {
    [classes.editing]: editing,
    [classes.hovering]: hovering && !editing,
  });

  return (
    <div data-testid={action.id} className={className} onClick={onClick} onMouseOver={onHover} onFocus={onHover}>
      {editing ? (
        <ActionEditor
          action={action}
          actionType={actionType}
          onChange={props.onChange}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onRemove={props.onRemove}
        />
      ) : (
        <ActionDisplay action={action} actionType={actionType} />
      )}
      <div className={classes.bottomActions}>
        <Anchor
          href="#"
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            props.onRemove();
          }}
        >
          Remove
        </Anchor>
      </div>
    </div>
  );
}

const timingProperty: InternalSchemaElement = {
  path: 'PlanDefinition.action.timing[x]',
  min: 0,
  max: 1,
  description: '',
  isArray: false,
  constraints: [],
  type: ['dateTime', 'Period', 'Range', 'Timing'].map((t) => ({ code: t })),
};

interface ActionDisplayProps {
  readonly action: PlanDefinitionAction;
  readonly actionType: string | undefined;
}

function ActionDisplay(props: ActionDisplayProps): JSX.Element {
  const { action, actionType } = props;
  const [propertyValue, propertyType] = getActionTiming(action);
  return (
    <div>
      <div>
        {action.title || 'Untitled'} {actionType && `(${actionType})`}
      </div>
      {action.definitionCanonical && (
        <div>
          <ReferenceDisplay value={{ reference: action.definitionCanonical }} />
        </div>
      )}
      {propertyValue && (
        <div>
          <ResourcePropertyDisplay property={timingProperty} propertyType={propertyType} value={propertyValue} />
        </div>
      )}
    </div>
  );
}

interface ActionEditorProps {
  readonly action: PlanDefinitionAction;
  readonly actionType: string | undefined;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (action: PlanDefinitionAction) => void;
  readonly onRemove: () => void;
}

function ActionEditor(props: ActionEditorProps): JSX.Element {
  const { action } = props;
  const [actionType, setActionType] = useState<string | undefined>(props.actionType);

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...action,
      [property]: value,
    } as PlanDefinitionAction);
  }

  return (
    <Stack gap="xl">
      <TextInput
        name={`actionTitle-${action.id}`}
        label="Title"
        defaultValue={action.title}
        onChange={(e) => changeProperty('title', e.currentTarget.value)}
      />
      <TextInput
        name={`actionDescription-${action.id}`}
        label="Description"
        defaultValue={action.description}
        onChange={(e) => changeProperty('description', e.currentTarget.value)}
      />
      <NativeSelect
        label="Type of Action"
        description="The type of the action to be performed."
        name={`actionType-${action.id}`}
        defaultValue={actionType}
        onChange={(e) => setActionType(e.currentTarget.value)}
        data={['', 'appointment', 'lab', 'questionnaire', 'task']}
      />
      {action.action && action.action.length > 0 && (
        <ActionArrayBuilder
          actions={action.action}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onChange={(x) => changeProperty('action', x)}
        />
      )}
      {(() => {
        switch (actionType) {
          case 'appointment':
            return (
              <ActionResourceTypeBuilder
                title="Appointment"
                description="The subject must schedule an appointment from the schedule."
                resourceType="Schedule"
                action={action}
                onChange={props.onChange}
              />
            );
          case 'lab':
            return (
              <ActionResourceTypeBuilder
                title="Lab"
                description="The subject must complete the following lab panel."
                resourceType="ActivityDefinition"
                action={action}
                onChange={props.onChange}
              />
            );
          case 'questionnaire':
            return (
              <ActionResourceTypeBuilder
                title="Questionnaire"
                description="The subject must complete the selected questionnaire."
                resourceType="Questionnaire"
                action={action}
                onChange={props.onChange}
              />
            );
          case 'task':
            return (
              <ActionResourceTypeBuilder
                title="Task"
                description="The subject must complete the following task."
                resourceType="ActivityDefinition"
                action={action}
                onChange={props.onChange}
              />
            );
          default:
            return null;
        }
      })()}
      <FormSection title="Timing" description="When the action should take place.">
        <ActionTimingInput name={'timing-' + action.id} action={action} onChange={props.onChange} />
      </FormSection>
    </Stack>
  );
}

interface ActionResourceTypeBuilderProps {
  readonly action: PlanDefinitionAction;
  readonly title: string;
  readonly description: string;
  readonly resourceType: ResourceType;
  readonly onChange: (action: PlanDefinitionAction) => void;
}

function ActionResourceTypeBuilder(props: ActionResourceTypeBuilderProps): JSX.Element {
  const { id, definitionCanonical } = props.action;
  const reference = definitionCanonical?.startsWith(props.resourceType + '/')
    ? { reference: definitionCanonical }
    : undefined;
  return (
    <ResourceInput
      name={id as string}
      resourceType={props.resourceType}
      defaultValue={reference}
      loadOnFocus={true}
      onChange={(newValue) => {
        if (newValue) {
          props.onChange({ ...props.action, definitionCanonical: getReferenceString(newValue) });
        } else {
          props.onChange({ ...props.action, definitionCanonical: undefined });
        }
      }}
    />
  );
}

interface ActionTimingInputProps {
  readonly name: string;
  readonly action: PlanDefinitionAction;
  readonly onChange: (action: PlanDefinitionAction) => void;
}

function ActionTimingInput(props: ActionTimingInputProps): JSX.Element {
  const value = props.action;
  const key = 'timing';
  const [propertyValue, propertyType] = getActionTiming(value);
  return (
    <ResourcePropertyInput
      property={timingProperty}
      name="timing[x]"
      path="PlanDefinition.timing[x]"
      defaultValue={propertyValue}
      defaultPropertyType={propertyType}
      onChange={(newValue: any, propName?: string) => {
        props.onChange(setPropertyValue(value, key, propName ?? key, timingProperty, newValue));
      }}
      outcome={undefined}
    />
  );
}

function getInitialActionType(action: PlanDefinitionAction): string | undefined {
  if (action.definitionCanonical?.startsWith('Schedule')) {
    return 'appointment';
  }

  if (action.definitionCanonical?.startsWith('Questionnaire/')) {
    return 'questionnaire';
  }

  if (action.definitionCanonical?.startsWith('ActivityDefinition/')) {
    return 'task';
  }

  return undefined;
}

function getActionTiming(action: PlanDefinitionAction): [any, string] {
  return getValueAndType({ type: 'PlanDefinitionAction', value: action }, 'timing');
}

let nextId = 1;

/**
 * Generates a unique ID.
 * React needs unique IDs for components for rendering performance.
 * All of the important components in the questionnaire builder have id properties for this:
 * Questionnaire, QuestionnaireItem, and QuestionnaireItemAnswerOption.
 * @param existing - Optional existing id which will update nextId.
 * @returns A unique key.
 */
function generateId(existing?: string): string {
  if (existing) {
    if (existing.startsWith('id-')) {
      const existingNum = parseInt(existing.substring(3), 10);
      if (!isNaN(existingNum)) {
        nextId = Math.max(nextId, existingNum + 1);
      }
    }
    return existing;
  }
  return 'id-' + nextId++;
}

function ensurePlanDefinitionKeys(planDefinition: PlanDefinition): PlanDefinition {
  return {
    ...planDefinition,
    action: ensurePlanDefinitionActionKeys(planDefinition.action),
  } as PlanDefinition;
}

function ensurePlanDefinitionActionKeys(
  actions: PlanDefinitionAction[] | undefined
): PlanDefinitionAction[] | undefined {
  if (!actions) {
    return undefined;
  }
  return actions.map((action) => ({
    ...action,
    id: generateId(action.id),
    action: ensurePlanDefinitionActionKeys(action.action),
  }));
}
