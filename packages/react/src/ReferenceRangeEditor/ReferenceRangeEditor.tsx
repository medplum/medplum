import { ActionIcon, Button, createStyles, Divider, Group, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { formatRange, getCodeBySystem } from '@medplum/core';
import { CodeableConcept, ObservationDefinition, ObservationDefinitionQualifiedInterval } from '@medplum/fhirtypes';
import { IconCircleMinus, IconCirclePlus } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { Container } from '../Container/Container';
import { Form } from '../Form/Form';
import { RangeInput } from '../RangeInput/RangeInput';
import { killEvent } from '../utils/dom';

const useStyles = createStyles((theme) => ({
  section: {
    position: 'relative',
    margin: '4px 4px 8px 0',
    padding: '6px 12px 16px 6px',
    border: `1.5px solid ${theme.colors.gray[3]}`,
    borderRadius: theme.radius.sm,
    transition: 'all 0.1s',
  },
}));

// Properties of qualified intervals used for grouping
const intervalFilters = ['gender', 'age', 'gestationalAge', 'context', 'appliesTo'] as const;

export interface ReferenceRangeEditorProps {
  definition: ObservationDefinition;
  onSubmit: (result: ObservationDefinition) => void;
}

// Helper type that groups of qualified intervals by equal filter criteria
type IntervalGroup = {
  id: string;
  filters: Record<string, any>;
  intervals: ObservationDefinitionQualifiedInterval[];
};

const defaultProps: ReferenceRangeEditorProps = {
  definition: { resourceType: 'ObservationDefinition' },
  onSubmit: () => {
    return;
  },
};

export function ReferenceRangeEditor(props: ReferenceRangeEditorProps): JSX.Element {
  props = Object.assign(defaultProps, props);
  const defaultDefinition = props.definition;

  const [intervalGroups, setIntervalGroups] = useState<IntervalGroup[]>([]);
  const [groupId, setGroupId] = useState(1);
  const [intervalId, setIntervalId] = useState(1);

  useEffect(() => {
    const definition = ensureQualifiedIntervalKeys(defaultDefinition, setIntervalId);
    setIntervalGroups(groupQualifiedIntervals(definition.qualifiedInterval || [], setGroupId));
  }, [defaultDefinition]);

  return (
    <Form testid="reference-range-editor" onSubmit={submitDefinition}>
      <Stack>
        {intervalGroups.map((intervalGroup) => (
          <ReferenceRangeGroupEditor
            unit={getUnitString(defaultDefinition.quantitativeDetails?.unit)}
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
        title="Add Group"
        size="sm"
        onClick={(e: React.MouseEvent) => {
          killEvent(e);
          addGroup({ id: `group-id-${groupId}`, filters: {} as IntervalGroup['filters'], intervals: [] });
          setGroupId((id) => id + 1);
        }}
      >
        <IconCirclePlus />
      </ActionIcon>

      <Group position="right">
        <Button type="submit">Save</Button>
      </Group>
    </Form>
  );

  /**
   * Submit qualified intervals
   */

  function submitDefinition(): void {
    const qualifiedInterval = intervalGroups
      .flatMap((group) => group.intervals)
      .filter((interval) => !isEmptyInterval(interval));
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
    if (addedInterval.id === undefined) {
      addedInterval.id = `id-${intervalId}`;
      setIntervalId((id) => id + 1);
    }
    setIntervalGroups((groups) => {
      groups = [...groups];
      const currentGroupIndex = groups.findIndex((g) => g.id === groupId);

      if (currentGroupIndex != -1) {
        const currentGroup = { ...groups[currentGroupIndex] };
        addedInterval = { ...addedInterval, ...currentGroup.filters };
        currentGroup.intervals = [...currentGroup.intervals, addedInterval];
        groups[currentGroupIndex] = currentGroup;
      }

      return groups;
    });
  }

  function removeInterval(groupId: string, removedInterval: ObservationDefinitionQualifiedInterval): void {
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

/**
 * Helper component that renders an "interval group", which is a set of ObservationDefinitionQualifiedIntervals
 * that have the same filter values
 */
export interface ReferenceRangeGroupEditorProps {
  intervalGroup: IntervalGroup;
  unit: string | undefined;
  onChange: (groupId: string, changed: ObservationDefinitionQualifiedInterval) => void;
  onAdd: (groupId: string, added: ObservationDefinitionQualifiedInterval) => void;
  onRemove: (groupId: string, removed: ObservationDefinitionQualifiedInterval) => void;
  onRemoveGroup: (removedGroup: IntervalGroup) => void;
}

export function ReferenceRangeGroupEditor(props: ReferenceRangeGroupEditorProps): JSX.Element {
  const { intervalGroup, unit } = props;
  const { classes } = useStyles();
  return (
    <Container data-testid={intervalGroup.id} className={classes.section}>
      <Stack spacing={'lg'}>
        <Group position="right">
          <ActionIcon
            title="Remove Group"
            data-testid={`remove-group-button-${intervalGroup.id}`}
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
        <ReferenceRangeGroupFilters intervalGroup={intervalGroup} onChange={props.onChange} />
        <Divider />
        {intervalGroup.intervals.map((interval) => (
          <Stack key={`interval-${interval.id}`} spacing={'xs'}>
            <Group>
              <TextInput
                key={`condition-${interval.id}`}
                data-testid={`condition-${interval.id}`}
                defaultValue={interval.condition}
                label={'Condition: '}
                size={'sm'}
                onChange={(e) => {
                  killEvent(e);
                  props.onChange(intervalGroup.id, { ...interval, condition: e.currentTarget.value.trim() });
                }}
              />
              <ActionIcon
                title="Remove Interval"
                size="sm"
                key={`remove-interval-${interval.id}`}
                data-testid={`remove-interval-${interval.id}`}
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
              name={`range-${interval.id}`}
              defaultValue={interval.range}
            />
          </Stack>
        ))}
        <ActionIcon
          title="Add Interval"
          size="sm"
          onClick={(e: React.MouseEvent) => {
            killEvent(e);
            props.onAdd(intervalGroup.id, {
              range: {
                low: { unit },
                high: { unit },
              },
            });
          }}
        >
          <IconCirclePlus />
        </ActionIcon>
      </Stack>
    </Container>
  );
}

interface ReferenceRangeGroupFiltersProps {
  intervalGroup: IntervalGroup;
  onChange: ReferenceRangeGroupEditorProps['onChange'];
}

/**
 * Render the "filters" section of the IntervalGroup. Also populates some initial
 */
function ReferenceRangeGroupFilters(props: ReferenceRangeGroupFiltersProps): JSX.Element {
  const { intervalGroup, onChange } = props;

  // Pre-populate the units of the age filter
  if (!intervalGroup.filters.age) {
    intervalGroup.filters.age = {};
  }
  for (const key of ['low', 'high']) {
    if (!intervalGroup.filters.age[key]?.unit) {
      intervalGroup.filters.age[key] = {
        ...intervalGroup.filters.age[key],
        unit: 'years',
        system: 'http://unitsofmeasure.org',
      };
    }
  }

  return (
    <Stack style={{ maxWidth: '50%' }}>
      <Group>
        <NativeSelect
          data={['', 'male', 'female']}
          label="Gender:"
          defaultValue={intervalGroup.filters.gender || ''}
          onChange={(e) => {
            for (const interval of intervalGroup.intervals) {
              let newGender: string | undefined = e.currentTarget?.value;
              if (newGender === '') {
                newGender = undefined;
              }
              onChange(intervalGroup.id, {
                ...interval,
                gender: newGender as ObservationDefinitionQualifiedInterval['gender'],
              });
            }
          }}
        />
      </Group>
      <Group spacing={'xs'}>
        <Text component="label" htmlFor={`div-age-${intervalGroup.id}`}>
          Age:
        </Text>
        <div id={`div-age-${intervalGroup.id}`}>
          <RangeInput
            key={`age-${intervalGroup.id}`}
            name={`age-${intervalGroup.id}`}
            defaultValue={intervalGroup.filters['age']}
            onChange={(ageRange) => {
              for (const interval of intervalGroup.intervals) {
                onChange(intervalGroup.id, { ...interval, age: ageRange });
              }
            }}
          />
        </div>
      </Group>
      <NativeSelect
        data={['', 'pre-puberty', 'follicular', 'midcycle', 'luteal', 'postmenopausal']}
        label="Endocrine:"
        defaultValue={intervalGroup.filters.context?.text || ''}
        onChange={(e) => {
          for (const interval of intervalGroup.intervals) {
            let newEndocrine: string | undefined = e.currentTarget?.value;
            if (newEndocrine === '') {
              newEndocrine = undefined;
              onChange(intervalGroup.id, { ...interval, context: undefined });
            } else {
              onChange(intervalGroup.id, {
                ...interval,
                context: {
                  text: newEndocrine,
                  coding: [
                    { code: newEndocrine, system: 'http://terminology.hl7.org/CodeSystem/referencerange-meaning' },
                  ],
                },
              });
            }
          }
        }}
      />
    </Stack>
  );
}

/**
 * Helper function that assigns ids to each qualifiedInterval of an ObservationDefinition
 * @param definition An ObservationDefinition
 * @param setIntervalId React setState function for the intervalId
 * @returns
 */
function ensureQualifiedIntervalKeys(
  definition: ObservationDefinition,
  setIntervalId: (id: number) => void
): ObservationDefinition {
  const intervals = definition.qualifiedInterval || [];
  // Set the nextId to the max of any existing numeric id
  let nextId =
    Math.max(
      ...intervals.map((interval) => {
        const existingNum = parseInt(interval.id?.substring(3) || '');
        return !isNaN(existingNum) ? existingNum : Number.NEGATIVE_INFINITY;
      })
    ) + 1;

  if (!Number.isFinite(nextId)) {
    nextId = 1;
  }

  // If an interval doesn't have an id, set it to the nextId
  definition = {
    ...definition,
    qualifiedInterval: intervals.map((interval) => ({
      ...interval,
      id: interval.id || `id-${nextId++}`,
    })),
  };
  setIntervalId(nextId);
  return definition;
}

/**
 * Group all ObservationDefinitionQualifiedIntervals based on the values of their "filter" properties,
 * so that similar ranges can be grouped together
 */
function groupQualifiedIntervals(
  intervals: ObservationDefinitionQualifiedInterval[],
  setGroupId: (id: number) => void
): IntervalGroup[] {
  let groupId = 1;
  const groups: Record<string, IntervalGroup> = {};
  for (const interval of intervals) {
    const groupKey = generateGroupKey(interval);
    if (!(groupKey in groups)) {
      groups[groupKey] = {
        id: `group-id-${groupId++}`,
        filters: Object.fromEntries(intervalFilters.map((f) => [f, interval[f]])) as Record<string, any>,
        intervals: [],
      };
    }
    groups[groupKey].intervals.push(interval);
  }
  setGroupId(groupId);
  return Object.values(groups);
}

/**
 * Generates a unique string for each set of filter values, so that similarly filtered intervals can be grouped together
 * @return A "group key" that corresponds to the value of the interval filter properties.
 */

function generateGroupKey(interval: ObservationDefinitionQualifiedInterval): string {
  const results = [
    `gender=${interval.gender}`,
    `age=${formatRange(interval.age)}`,
    `gestationalAge=${formatRange(interval.gestationalAge)}`,
    `context=${interval.context?.text}`,
    `appliesTo=${interval.appliesTo?.map((c) => c.text).join('+')}`,
  ];

  return results.join(':');
}

function getUnitString(unit: CodeableConcept | undefined): string | undefined {
  return unit && (getCodeBySystem(unit, 'http://unitsofmeasure.org') || unit.text);
}

function isEmptyInterval(interval: ObservationDefinitionQualifiedInterval): boolean {
  return interval.range?.low?.value === undefined && interval.range?.high?.value === undefined;
}
