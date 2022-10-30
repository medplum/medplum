import {
  ActionIcon,
  Button,
  Container,
  createStyles,
  Group,
  NativeSelect,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import {
  ObservationDefinition,
  ObservationDefinitionQualifiedInterval,
  ObservationDefinitionQuantitativeDetails,
} from '@medplum/fhirtypes';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons';
import { killEvent } from './utils/dom';

import React, { useEffect, useState } from 'react';
import { Form } from './Form';
import { RangeInput } from './RangeInput';
import { formatRangeString } from '@medplum/core';

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

const intervalFilters = ['gender', 'age', 'gestationalAge', 'appliesTo'] as const;

export interface ReferenceRangeEditorProps {
  definition: ObservationDefinition;
  groupBy?: typeof intervalFilters[number][];
  onSubmit: (result: ObservationDefinition) => void;
}

type IntervalGroup = {
  id: string;
  filters: Record<typeof intervalFilters[number], any>;
  intervals: ObservationDefinitionQualifiedInterval[];
};

const defaultProps: ReferenceRangeEditorProps = {
  definition: { resourceType: 'ObservationDefinition' },
  groupBy: ['gender', 'age'],
  onSubmit: () => {
    return;
  },
};

export function ReferenceRangeEditor(props: ReferenceRangeEditorProps): JSX.Element {
  props = Object.assign(defaultProps, props);
  const defaultDefinition = props.definition;

  // const [definition, setDefinition] = useState<ObservationDefinition>(defaultDefinition);
  const [intervalGroups, setIntervalGroups] = useState<IntervalGroup[]>([]);

  useEffect(() => {
    const definition = ensureQualifiedIntervalKeys(defaultDefinition);
    setIntervalGroups(groupQualifiedIntervals(definition.qualifiedInterval || []));
  }, [defaultDefinition]);

  console.debug('Main Definition', intervalGroups);

  return (
    <>
      <Form onSubmit={submitDefinition}>
        <Stack>
          {intervalGroups.map((intervalGroup) => (
            <ReferenceRangeGroupEditor
              unit={defaultDefinition.quantitativeDetails?.unit}
              onChange={changeInterval}
              onAdd={addInterval}
              onRemove={removeInterval}
              onRemoveGroup={removeGroup}
              key={`group-${intervalGroup.id}`}
              intervalGroup={intervalGroup}
            />
          ))}
        </Stack>
        <ActionIcon
          title="Add Groups"
          size="sm"
          onClick={(e: React.MouseEvent) => {
            killEvent(e);
            addGroup({ id: generateGroupId(), filters: {} as IntervalGroup['filters'], intervals: [] });
          }}
        >
          <IconCirclePlus />
        </ActionIcon>

        <Button type="submit">Save</Button>
      </Form>
    </>
  );

  /**
   * Submit qualified intervals
   */

  function submitDefinition(): void {
    const qualifiedInterval = intervalGroups.flatMap((group) => group.intervals);
    props.onSubmit({ ...defaultDefinition, qualifiedInterval });
  }

  /**
   * Add Remove Interval Groups
   */

  function addGroup(addedGroup: IntervalGroup): void {
    setIntervalGroups((currentGroups) => [...currentGroups, addedGroup]);
  }

  function removeGroup(removedGroup: IntervalGroup): void {
    setIntervalGroups((currentGroups) => currentGroups.filter((group) => group.id !== removedGroup.id));
  }

  /**
   * Add/Remove/Update specific Qualified Intervals
   */
  function changeInterval(groupId: string, changedInterval: ObservationDefinitionQualifiedInterval): void {
    setIntervalGroups((groups) => {
      groups = [...groups];
      const currentGroup = groups.find((g) => g.id === groupId);

      const index = currentGroup?.intervals?.findIndex((interval) => interval.id === changedInterval.id);
      if (index !== undefined && currentGroup?.intervals?.[index]) {
        currentGroup.intervals[index] = changedInterval;
      }
      return groups;
    });
  }

  function addInterval(groupId: string, addedInterval: ObservationDefinitionQualifiedInterval): void {
    setIntervalGroups((groups) => {
      groups = [...groups];
      const currentGroup = groups.find((g) => g.id === groupId);
      if (currentGroup) {
        currentGroup.intervals = [...currentGroup.intervals, addedInterval];
      }
      return groups;
    });
  }

  function removeInterval(groupId: string, removedInterval: ObservationDefinitionQualifiedInterval): void {
    console.debug('Removing interval', removedInterval);
    setIntervalGroups((groups) => {
      groups = [...groups];
      const currentGroup = groups.find((g) => g.id === groupId);
      if (currentGroup) {
        currentGroup.intervals = currentGroup.intervals.filter((interval) => interval.id !== removedInterval.id);
      }
      return groups;
    });
  }
}

export interface ReferenceRangeGroupEditorProps {
  intervalGroup: IntervalGroup;
  unit: ObservationDefinitionQuantitativeDetails['unit'];
  onChange: (groupId: string, changed: ObservationDefinitionQualifiedInterval) => void;
  onAdd: (groupId: string, added: ObservationDefinitionQualifiedInterval) => void;
  onRemove: (groupId: string, removed: ObservationDefinitionQualifiedInterval) => void;
  onRemoveGroup: (removedGroup: IntervalGroup) => void;
}

export function ReferenceRangeGroupEditor(props: ReferenceRangeGroupEditorProps): JSX.Element {
  const { intervalGroup } = props;
  const { classes } = useStyles();
  return (
    <Container className={classes.section}>
      <Stack spacing={'lg'}>
        <Group>
          <Title order={3}>{intervalGroup.id}</Title>
          <ActionIcon
            title="Remove Group"
            key={`remove-group-button-${intervalGroup.id}`}
            size="sm"
            onClick={(e: React.MouseEvent) => {
              killEvent(e);
              props.onRemoveGroup(intervalGroup);
            }}
          >
            <IconCircleMinus />
          </ActionIcon>
        </Group>
        <Stack style={{ maxWidth: '25%' }}>
          <NativeSelect
            data={['', 'male', 'female']}
            label="Gender:"
            onChange={(e) => {
              for (const interval of intervalGroup.intervals) {
                const newGender = e.currentTarget.value as ObservationDefinitionQualifiedInterval['gender'];
                props.onChange(intervalGroup.id, {
                  ...interval,
                  gender: newGender,
                });
              }
            }}
          />
        </Stack>
        {intervalGroup.intervals.map((interval, index) => (
          <Stack key={interval.id} spacing={'xs'}>
            <Group>
              <TextInput
                key={`condition-${interval.id}`}
                defaultValue={interval.condition}
                label={'Condition: '}
                size={'sm'}
                onChange={(e) => {
                  killEvent(e);
                  props.onChange(intervalGroup.id, { ...interval, condition: e.currentTarget.value });
                  console.debug('Condition changed', e.currentTarget.value);
                }}
              />
              <ActionIcon
                title="Remove"
                size="sm"
                onClick={(e: React.MouseEvent) => {
                  killEvent(e);
                  props.onRemove(intervalGroup.id, interval);
                }}
              >
                <IconCircleMinus />
              </ActionIcon>
            </Group>

            <RangeInput
              onChange={(range) => {
                props.onChange(intervalGroup.id, { ...interval, range });
              }}
              key={`range-${interval.id}`}
              name={`range-${index}`}
              defaultValue={interval.range}
            />
          </Stack>
        ))}
        <ActionIcon
          title="Add"
          size="sm"
          onClick={(e: React.MouseEvent) => {
            killEvent(e);
            props.onAdd(intervalGroup.id, { id: generateId() });
          }}
        >
          <IconCirclePlus />
        </ActionIcon>
      </Stack>
    </Container>
  );
}

function ensureQualifiedIntervalKeys(definition: ObservationDefinition): ObservationDefinition {
  const intervals = definition.qualifiedInterval || [];
  return {
    ...definition,
    qualifiedInterval: intervals.map((interval) => ({
      ...interval,
      id: generateId(interval.id),
    })),
  };
}

function groupQualifiedIntervals(intervals: ObservationDefinitionQualifiedInterval[]): IntervalGroup[] {
  const groups: Record<string, IntervalGroup> = {};
  for (const interval of intervals) {
    const groupKey = generateGroupKey(interval);
    if (!(groupKey in groups)) {
      groups[groupKey] = {
        id: generateGroupId(),
        filters: Object.fromEntries(intervalFilters.map((f) => [f, interval[f]])) as Record<
          typeof intervalFilters[number],
          any
        >,
        intervals: [],
      };
    }
    groups[groupKey].intervals.push(interval);
  }
  return Object.values(groups);
}

/**
 * Generates a unique ID.
 * React needs unique IDs for components for rendering performance.
 * All of the important components in the questionnaire builder have id properties for this:
 * Questionnaire, QuestionnaireItem, and QuestionnaireItemAnswerOption.
 * @return A unique key.
 */
let nextId = 1;
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

let nextGroupId = 1;
function generateGroupId(existing?: string): string {
  if (existing) {
    if (existing.startsWith('group-id-')) {
      const existingNum = parseInt(existing.substring(3));
      if (!isNaN(existingNum)) {
        nextGroupId = Math.max(nextGroupId, existingNum + 1);
      }
    }
    return existing;
  }
  return 'group-id-' + nextGroupId++;
}

function generateGroupKey(interval: ObservationDefinitionQualifiedInterval): string {
  const results = [
    `gender=${interval.gender}`,
    `age=${formatRangeString(interval.age)}`,
    `gestationalAge=${formatRangeString(interval.gestationalAge)}`,
    `appliesTo=${interval.appliesTo?.[0]?.text}`,
  ];

  return results.join(':');
}
