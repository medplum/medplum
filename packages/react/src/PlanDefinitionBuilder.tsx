import { getReferenceString } from '@medplum/core';
import { PlanDefinition, PlanDefinitionAction, Reference } from '@medplum/fhirtypes';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { ResourceInput } from './ResourceInput';
import { Select } from './Select';
import { useResource } from './useResource';

export interface PlanDefinitionBuilderProps {
  value: PlanDefinition | Reference<PlanDefinition>;
  onSubmit: (result: PlanDefinition) => void;
}

export function PlanDefinitionBuilder(props: PlanDefinitionBuilderProps): JSX.Element | null {
  const defaultValue = useResource(props.value);
  const [value, setValue] = useState<PlanDefinition>();
  const valueRef = useRef<PlanDefinition>();
  valueRef.current = value;

  useEffect(() => {
    setValue(ensurePlanDefinitionKeys(defaultValue ?? { resourceType: 'PlanDefinition' }));
  }, [defaultValue]);

  if (!value) {
    return null;
  }

  function changeProperty(property: string, newValue: any): void {
    setValue({
      ...valueRef.current,
      [property]: newValue,
    } as PlanDefinition);
  }

  return (
    <div className="medplum-questionnaire-builder">
      <Form testid="questionnaire-form" onSubmit={() => props.onSubmit(value)}>
        <FormSection
          title="Plan Title"
          description="The display name of the 'Plan', something that can be ordered."
          htmlFor="title"
        >
          <Input defaultValue={value.title} onChange={(newValue) => changeProperty('title', newValue)} />
        </FormSection>
        <ActionArrayBuilder actions={value.action || []} onChange={(x) => changeProperty('action', x)} />
        <Button type="submit" size="large">
          Save
        </Button>
      </Form>
    </div>
  );
}

interface ActionArrayBuilderProps {
  actions: PlanDefinitionAction[];
  onChange: (actions: PlanDefinitionAction[]) => void;
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
  }

  function removeAction(removedAction: PlanDefinitionAction): void {
    props.onChange((actionsRef.current as PlanDefinition[]).filter((i) => i !== removedAction));
  }

  return (
    <div className="section">
      {props.actions.map((i) => (
        <div key={i.id}>
          <ActionBuilder action={i} onChange={changeAction} onRemove={() => removeAction(i)} />
        </div>
      ))}
      <div className="bottom-actions">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            addAction({ id: generateId() });
          }}
        >
          Add action
        </a>
      </div>
    </div>
  );
}

interface ActionBuilderProps {
  action: PlanDefinitionAction;
  onChange: (action: PlanDefinitionAction) => void;
  onRemove: () => void;
}

function ActionBuilder(props: ActionBuilderProps): JSX.Element {
  const { action } = props;
  const [actionType, setActionType] = useState<string | undefined>(getInitialActionType(action));

  const actionRef = useRef<PlanDefinitionAction>();
  actionRef.current = props.action;

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...actionRef.current,
      [property]: value,
    } as PlanDefinitionAction);
  }

  return (
    <div className="section">
      <FormSection
        title="Action Title"
        description="The name of the action, an operational task to be completed."
        htmlFor={`actionTitle-${action.id}`}
      >
        <Input
          name={`actionTitle-${action.id}`}
          defaultValue={action.title}
          onChange={(newValue) => changeProperty('title', newValue)}
        />
      </FormSection>
      <FormSection
        title="Action Type"
        description="The type of the action to be performed."
        htmlFor={`actionType-${action.id}`}
      >
        <Select name={`actionType-${action.id}`} defaultValue={actionType} onChange={setActionType}>
          <option></option>
          <option value="appointment">Appointment</option>
          <option value="documentation">Documentation</option>
          <option value="lab">Lab</option>
          <option value="questionnaire">Questionnaire</option>
          <option value="shipping">Shipping</option>
          <option value="task">Task</option>
        </Select>
      </FormSection>
      {action.action && action.action.length > 0 && (
        <ActionArrayBuilder actions={action.action} onChange={(x) => changeProperty('action', x)} />
      )}
      {(() => {
        switch (actionType) {
          case 'appointment':
            return <div>Appointment details</div>;
          case 'documentation':
            return <div>Documentation details</div>;
          case 'lab':
            return <LabActionBuilder action={action} onChange={props.onChange} />;
          case 'questionnaire':
            return <QuestionnaireActionBuilder action={action} onChange={props.onChange} />;
          case 'shipping':
            return <div>Shipping details</div>;
          case 'task':
            return <div>Task details</div>;
          default:
            return null;
        }
      })()}
      <div className="bottom-actions">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            props.onRemove();
          }}
        >
          Remove
        </a>
      </div>
    </div>
  );
}

interface LabActionBuilderProps {
  action: PlanDefinitionAction;
  onChange: (action: PlanDefinitionAction) => void;
}

function LabActionBuilder(props: LabActionBuilderProps): JSX.Element {
  return (
    <FormSection title="Lab Details" description="Choose observations definitions" htmlFor={props.action.id}>
      <a href="#" onClick={() => props.onChange(props.action)}>
        Add
      </a>
    </FormSection>
  );
}

interface QuestionnaireActionBuilderProps {
  action: PlanDefinitionAction;
  onChange: (action: PlanDefinitionAction) => void;
}

function QuestionnaireActionBuilder(props: QuestionnaireActionBuilderProps): JSX.Element {
  const { id, definitionCanonical } = props.action;
  const questionnaireRef = definitionCanonical?.startsWith('Questionnaire/')
    ? { reference: definitionCanonical }
    : undefined;
  return (
    <FormSection title="Questionnaire" description="Choose questionnaire" htmlFor={id}>
      <ResourceInput
        name={id as string}
        resourceType="Questionnaire"
        defaultValue={questionnaireRef}
        onChange={(newValue) => {
          if (newValue) {
            props.onChange({ ...props.action, definitionCanonical: getReferenceString(newValue) });
          } else {
            props.onChange({ ...props.action, definitionCanonical: undefined });
          }
        }}
      />
    </FormSection>
  );
}

function getInitialActionType(action: PlanDefinitionAction): string | undefined {
  if (action.definitionCanonical?.startsWith('Questionnaire/')) {
    return 'questionnaire';
  }

  return undefined;
}

let nextId = 1;

/**
 * Generates a unique ID.
 * React needs unique IDs for components for rendering performance.
 * All of the important components in the questionnaire builder have id properties for this:
 * Questionnaire, QuestionnaireItem, and QuestionnaireItemAnswerOption.
 * @return A unique key.
 */
function generateId(existing?: string): string {
  if (existing) {
    if (existing.startsWith('id-')) {
      const existingNum = parseInt(existing.substring(3));
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
