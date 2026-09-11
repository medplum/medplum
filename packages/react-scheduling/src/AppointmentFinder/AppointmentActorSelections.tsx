// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Group, Input, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { IconPlus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import type { BookableActorType } from '../actors';
import { BOOKABLE_ACTOR_TYPES, getActorTypeLabel, isActorTypeRequired } from '../actors';
import { AppointmentActorSelect } from './AppointmentActorSelect';
import type { ActorRequirement, ActorSelections, ScheduleCandidate } from './AppointmentFinder.schedules';
import { createActorRequirement } from './AppointmentFinder.schedules';

/** The control that drops a row. */
const CONTROL_SIZE = 'lg';

export interface AppointmentActorSelectionsProps {
  /** What the appointment is being asked for so far, per actor type. */
  readonly value: ActorSelections;
  /** The service being booked. Nothing is offered until it resolves. */
  readonly service: Reference<HealthcareService> | WithId<HealthcareService> | undefined;
  /** The site being booked at. Actors sited elsewhere are left out. */
  readonly location?: Reference<Location> | WithId<Location>;
  readonly disabled?: boolean;
  readonly onChange: (selections: ActorSelections) => void;
}

/**
 * Asks what an appointment needs by actor type (e.g., provider, room, device).
 *
 * Each actor type gets a stack of rows. **The rows are ANDed and the names
 * within a row are ORed**: two provider rows ask for two providers, while two
 * names in one row ask for either of them.
 *
 * A row is one alternative set, so it is also one dimension of the search:
 * `getActorCombinations` takes one name from each row, and every way of doing
 * that is one `$find` request.
 *
 * @param props - The React props.
 * @returns One group of rows per bookable actor type.
 */
export function AppointmentActorSelections(props: AppointmentActorSelectionsProps): JSX.Element {
  const { value, service, location, disabled, onChange } = props;

  const changeRequirements = useCallback(
    (actorType: BookableActorType, requirements: readonly ActorRequirement[]): void => {
      onChange({ ...value, [actorType]: requirements });
    },
    [onChange, value]
  );

  return (
    <>
      {BOOKABLE_ACTOR_TYPES.map((actorType) => (
        <ActorTypeRows
          key={actorType}
          actorType={actorType}
          requirements={value[actorType]}
          service={service}
          location={location}
          disabled={disabled}
          onChange={changeRequirements}
        />
      ))}
    </>
  );
}

interface ActorTypeRowsProps {
  readonly actorType: BookableActorType;
  readonly requirements: readonly ActorRequirement[] | undefined;
  readonly service: Reference<HealthcareService> | WithId<HealthcareService> | undefined;
  readonly location?: Reference<Location> | WithId<Location>;
  readonly disabled?: boolean;
  readonly onChange: (actorType: BookableActorType, requirements: readonly ActorRequirement[]) => void;
}

/**
 * One actor type's rows, and the controls that add and remove them.
 * @param props - The React props.
 * @returns The group of rows.
 */
function ActorTypeRows(props: ActorTypeRowsProps): JSX.Element {
  const { actorType, service, location, disabled, onChange } = props;
  const label = getActorTypeLabel(actorType);
  const lowercaseLabel = label.toLowerCase();
  const required = isActorTypeRequired(actorType);
  const rows = props.requirements?.length ? props.requirements : [getBlankRequirement(actorType)];
  const several = rows.length > 1;
  const canAddAnother = rows[rows.length - 1].candidates.length > 0;

  function change(next: readonly ActorRequirement[]): void {
    onChange(actorType, next);
  }

  return (
    <Stack gap={4} role="group" aria-label={label}>
      {several && (
        <Input.Label labelElement="div" required={required}>
          {label}
        </Input.Label>
      )}

      {rows.map((row, index) => (
        <Group key={row.id} align="flex-end" wrap="nowrap" gap="xs">
          <Box flex={1} miw={0}>
            <AppointmentActorSelect
              actorType={actorType}
              service={service}
              location={location}
              disabled={disabled}
              label={several ? <RowLabel index={index} label={label} /> : label}
              placeholder={row.candidates.length > 0 ? 'or…' : `Search ${lowercaseLabel}s`}
              required={required}
              // With several rows the asterisk belongs to the heading above them,
              // since it is the type that has to be answered and not this row.
              withAsterisk={!several && required}
              defaultValue={row.candidates}
              onChange={(candidates: readonly ScheduleCandidate[]) =>
                change(rows.map((held) => (held.id === row.id ? { ...held, candidates } : held)))
              }
            />
          </Box>

          {several && (
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="xl"
              size={CONTROL_SIZE}
              disabled={disabled}
              aria-label={`Remove ${lowercaseLabel} ${index + 1}`}
              onClick={() => change(rows.filter((held) => held.id !== row.id))}
            >
              <IconX size={16} stroke={1.8} />
            </ActionIcon>
          )}
        </Group>
      ))}

      {canAddAnother && (
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconPlus size={14} stroke={1.8} />}
          disabled={disabled}
          style={{ alignSelf: 'flex-start' }}
          onClick={() => change([...rows, createActorRequirement()])}
        >
          Add another {lowercaseLabel}
        </Button>
      )}
    </Stack>
  );
}

interface RowLabelProps {
  readonly index: number;
  readonly label: string;
}

/**
 * Names one row of several, saying how it reads against the row above it
 * (e.g. Provider 1, And Provider 2).
 * @param props - Where the row sits, and what its actor type is called.
 * @returns The label.
 */
function RowLabel(props: RowLabelProps): JSX.Element {
  const { index, label } = props;
  return (
    <>
      {index > 0 && (
        <>
          <Text span c="teal" fw={600} inherit>
            And
          </Text>{' '}
        </>
      )}
      <Text span c="dimmed" fw={400} inherit>
        {label} {index + 1}
      </Text>
    </>
  );
}

/**
 * The row an actor type nobody has answered is asked in.
 * @param actorType - The type being asked about.
 * @returns The empty row.
 */
function getBlankRequirement(actorType: BookableActorType): ActorRequirement {
  return { id: `${actorType}-blank`, candidates: [] };
}
