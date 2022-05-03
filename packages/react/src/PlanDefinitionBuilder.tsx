import { PlanDefinition, PlanDefinitionAction, Reference } from '@medplum/fhirtypes';
import React, { useRef, useState } from 'react';
import { Button } from './Button';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { Select } from './Select';

export interface PlanDefinitionBuilderProps {
  value: PlanDefinition | Reference<PlanDefinition>;
  onSubmit: (result: PlanDefinition) => void;
}

export function PlanDefinitionBuilder(props: PlanDefinitionBuilderProps): JSX.Element | null {
  const [value, setValue] = useState<PlanDefinition>({
    resourceType: 'PlanDefinition',
    action: [
      {
        id: generateId(),
      },
    ],
  });

  const valueRef = useRef<PlanDefinition>();
  valueRef.current = value;

  if (!value) {
    return null;
  }

  function changeProperty(property: string, value: any): void {
    setValue({
      ...valueRef.current,
      [property]: value,
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
  onRemove?: () => void;
}

function ActionBuilder(props: ActionBuilderProps): JSX.Element {
  const resource = props.action as PlanDefinition;
  const action = props.action as PlanDefinitionAction;
  const [actionType, setActionType] = useState<string>();

  const actionRef = useRef<PlanDefinitionAction>();
  actionRef.current = props.action;

  function addAction(addedAction: PlanDefinitionAction): void {
    props.onChange({
      ...props.action,
      action: [...(props.action?.action ?? []), addedAction],
    });
  }

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
          defaultValue={resource.title}
          onChange={(newValue) => changeProperty('title', newValue)}
        />
      </FormSection>
      <FormSection
        title="Action Type"
        description="The type of the action to be performed."
        htmlFor={`actionType-${action.id}`}
      >
        <Select name={`actionType-${action.id}`} onChange={setActionType}>
          <option></option>
          <option value="appointment">Appointment</option>
          <option value="documentation">Documentation</option>
          <option value="lab">Lab</option>
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
            addAction({ id: generateId() });
          }}
        >
          Add sub-action
        </a>
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

interface LabActionBuilderProps {
  action: PlanDefinitionAction;
  onChange: (action: PlanDefinitionAction) => void;
}

function LabActionBuilder(props: LabActionBuilderProps): JSX.Element {
  return (
    <>
      <h2>Lab Details</h2>
      <div>Choose Observations</div>
      <a href="#" onClick={() => props.onChange(props.action)}>
        Add
      </a>
    </>
  );
}

let nextId = 1;

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
