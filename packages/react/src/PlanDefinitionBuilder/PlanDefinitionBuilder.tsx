// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Anchor,
  Box,
  Button,
  CloseButton,
  Flex,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { PlanDefinition, PlanDefinitionAction, Reference, ResourceType } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import { JSX, MouseEvent, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { ResourceInput } from '../ResourceInput/ResourceInput';
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

  const valueRef = useRef<PlanDefinition>(value);
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
          py="md"
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
        <SubmitButton>Save</SubmitButton>
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
  const actionsRef = useRef<PlanDefinitionAction[]>(props.actions);
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
    <Stack gap="md" className={classes.section}>
      {props.actions.map((action) => (
        <ActionBuilder
          key={action.id}
          action={action}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onChange={changeAction}
          onRemove={() => removeAction(action)}
        />
      ))}
      <div>
        <Button
          variant="outline"
          onClick={(e: MouseEvent) => {
            killEvent(e);
            addAction({ id: generateId() });
          }}
        >
          Add action
        </Button>
      </div>
    </Stack>
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

  function onClick(e: SyntheticEvent): void {
    e.stopPropagation();
    props.setSelectedKey(props.action.id);
  }

  function onHover(e: SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey(props.action.id);
  }

  return (
    <div onClick={onClick} onMouseOver={onHover} onFocus={onHover}>
      <ActionEditor
        action={action}
        actionType={actionType}
        onChange={props.onChange}
        selectedKey={props.selectedKey}
        hoverKey={props.hoverKey}
        onRemove={props.onRemove}
      />
    </div>
  );
}

interface ActionEditorProps {
  readonly action: PlanDefinitionAction;
  readonly actionType: string | undefined;
  readonly selectedKey: string | undefined;
  readonly hoverKey: string | undefined;
  readonly onChange: (action: PlanDefinitionAction) => void;
  readonly onRemove: () => void;
}

function ActionEditor(props: ActionEditorProps): JSX.Element {
  const { action } = props;
  const [actionType, setActionType] = useState<string | undefined>(props.actionType);
  const editing = props.selectedKey === props.action.id;
  const hovering = props.hoverKey === props.action.id;

  function changeProperty(property: string, value: any): void {
    props.onChange({
      ...action,
      [property]: value,
    } as PlanDefinitionAction);
  }

  const className = cx(classes.section, {
    [classes.hovering]: hovering && !editing,
  });

  return (
    <Paper data-testid={action.id} className={className} p={0} radius="sm" withBorder>
      <Flex w="100%" p="xs" bg="gray.0" gap="md" align="center" justify="space-between">
        <TextInput
          w="100%"
          name={`actionTitle-${action.id}`}
          defaultValue={action.title}
          placeholder="Title"
          onChange={(e) => changeProperty('title', e.currentTarget.value)}
        />
        <CloseButton data-testid="close-button" onClick={props.onRemove} />
      </Flex>

      {editing && (
        <Stack gap="xl" p="md">
          <Box>
            <TextInput
              label="Task Description"
              placeholder="Enter task description"
              name={`actionDescription-${action.id}`}
              defaultValue={action.description}
              onChange={(e) => changeProperty('description', e.currentTarget.value)}
            />
          </Box>

          <Box>
            <NativeSelect
              label="Type of Action"
              value={actionType}
              onChange={(e) => {
                const value = e.currentTarget.value === 'standard' ? undefined : e.currentTarget.value;
                setActionType(value);
                props.onChange({
                  ...props.action,
                  definitionCanonical: value === 'standard' ? undefined : props.action.definitionCanonical,
                });
              }}
              data={[
                { value: 'standard', label: 'Standard task' },
                { value: 'questionnaire', label: 'Task with Questionnaire' },
                { value: 'activitydefinition', label: 'Task with Activity Definition' },
              ]}
            />
          </Box>

          {actionType === 'questionnaire' && (
            <Stack gap={0}>
              <Group gap={0} mb="xs">
                <Text fw={600}>Select questionnaire</Text>
                <Text c="red">*</Text>
              </Group>
              <Text size="sm" c="dimmed" mb="sm">
                Questionnaire to be shown in the task in Encounter view. You can create new one from{' '}
                <Anchor href="/Questionnaire" target="_blank" c="blue">
                  questionnaires list
                </Anchor>
              </Text>
              <ActionResourceTypeBuilder resourceType="Questionnaire" action={action} onChange={props.onChange} />
            </Stack>
          )}

          {actionType === 'activitydefinition' && (
            <Stack gap={0}>
              <Group gap={0} mb="xs">
                <Text fw={600}>Select activity definition</Text>
                <Text c="red">*</Text>
              </Group>
              <Text size="sm" c="dimmed" mb="sm">
                ActivityDefinition.kind resource to be shown in the task in Encounter view. You can create new one from{' '}
                <Anchor href="/ActivityDefinition" target="_blank" c="blue">
                  activity definitions list
                </Anchor>
              </Text>
              <ActionResourceTypeBuilder resourceType="ActivityDefinition" action={action} onChange={props.onChange} />
            </Stack>
          )}
        </Stack>
      )}
    </Paper>
  );
}

interface ActionResourceTypeBuilderProps {
  readonly action: PlanDefinitionAction;
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

function getInitialActionType(action: PlanDefinitionAction): string | undefined {
  if (action.definitionCanonical?.startsWith('Questionnaire')) {
    return 'questionnaire';
  }

  if (action.definitionCanonical?.startsWith('ActivityDefinition')) {
    return 'activitydefinition';
  }

  return 'standard';
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
