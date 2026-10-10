// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Alert, Badge, Divider, Group, Menu, Stack, Text, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconAlertTriangle, IconDots, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useId } from 'react';
import type { SchedulingParameterValues } from '../../parameterValues';
import { getHealthcareServiceSchedulingParameterValues } from '../../parameterValues';
import { ScheduleAvailabilityFields } from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityFields';
import type { SchedulingParameterErrors } from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import {
  getInheritedDefaults,
  getSchedulingParameterWarnings,
  getVisibleParameters,
} from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import { SchedulingParametersFields } from '../../SchedulingParametersEditor/SchedulingParametersFields';
import { ParameterWarnings } from '../ConfigPage/ParameterWarnings';
import { OverridesBadge } from '../OverridesBadge';
import type { OfferingFields } from './scheduleDraft';
import { hasOverrides } from './scheduleDraft';

export interface OfferingSummaryProps {
  readonly service: WithId<HealthcareService>;
  readonly value: OfferingFields;
  /** The duration in effect and where the hours come from. */
  readonly summary: string;
  readonly dirty: boolean;
  /** Why the visit type can't be booked with this actor, when it can't. */
  readonly notBookableReason?: string;
}

/**
 * One visit type an actor's Schedule offers, in a line: its name, whether the Schedule customizes it or holds
 * unsaved changes to it, and how it is scheduled.
 * @param props - The visit type, what the Schedule sets for it, and what to say about it.
 * @returns The summary.
 */
export function OfferingSummary(props: OfferingSummaryProps): JSX.Element {
  const { service, value, summary, dirty, notBookableReason } = props;
  const serviceName = service.name ?? 'this visit type';
  return (
    <Stack gap={2}>
      <Group gap="xs" wrap="nowrap">
        <Text fw={600} truncate>
          {serviceName}
        </Text>
        {hasOverrides(value) && <OverridesBadge serviceName={serviceName} />}
        {dirty && (
          <Badge size="xs" variant="light" color="orange">
            Unsaved
          </Badge>
        )}
        {notBookableReason && (
          <Badge size="xs" variant="light" color="orange">
            Can't be booked
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" truncate>
        {summary}
      </Text>
    </Stack>
  );
}

export interface OfferingMenuProps {
  readonly service: WithId<HealthcareService>;
  readonly onStopOffering: () => void;
}

/**
 * What can be done with one visit type an actor's Schedule offers.
 * @param props - The visit type, and what to do when it's stopped.
 * @returns The menu.
 */
export function OfferingMenu(props: OfferingMenuProps): JSX.Element {
  const serviceName = props.service.name ?? 'this visit type';
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${serviceName}`}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={props.onStopOffering}>
          Stop offering
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export interface OfferingEditorProps {
  readonly service: WithId<HealthcareService>;
  readonly value: OfferingFields;
  /** What the Schedule set for the visit type when the page opened, empty for one offered since. */
  readonly initialParameters: SchedulingParameterValues;
  readonly onChange: (value: OfferingFields) => void;
  readonly errors: SchedulingParameterErrors;
  /** Why the hours can't be saved, once a save has been tried. */
  readonly availabilityError?: string;
  /** Why the visit type can't be booked with this actor, when it can't. */
  readonly notBookableReason?: string;
  /** The time zone the hours are read in, and where it comes from. Absent when none resolves. */
  readonly timezone?: { readonly zone: string; readonly source: string };
}

/**
 * The Schedule's own parameters and hours for one visit type it offers.
 * @param props - The visit type, what the Schedule sets for it, and what to do when it changes.
 * @returns The editor.
 */
export function OfferingEditor(props: OfferingEditorProps): JSX.Element {
  const { service, value, initialParameters, onChange, errors, availabilityError, notBookableReason } = props;
  const idPrefix = useId();
  const serviceName = service.name ?? 'this visit type';
  const serviceValues = getHealthcareServiceSchedulingParameterValues(service);
  const { defaults, labels } = getInheritedDefaults(serviceValues, serviceName);
  const warnings = getSchedulingParameterWarnings(value.parameters, initialParameters, serviceValues);

  return (
    <Stack gap="lg">
      {notBookableReason && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
          Can't be booked here. {notBookableReason}.
        </Alert>
      )}

      <Stack gap="sm">
        <Title order={4} size="h5">
          Scheduling parameters
        </Title>
        <Text size="sm" c="dimmed">
          Leave a field empty to use {serviceName}'s setting.
        </Text>
        <SchedulingParametersFields
          values={value.parameters}
          defaults={defaults}
          defaultLabels={labels}
          errors={errors}
          idPrefix={idPrefix}
          onChange={(parameters) => onChange({ ...value, parameters })}
          visible={getVisibleParameters('schedule', initialParameters)}
        />
        <ParameterWarnings warnings={warnings} />
      </Stack>

      <Divider />

      <Stack gap="sm">
        <Title order={4} size="h5">
          Availability
        </Title>
        <ScheduleAvailabilityFields
          service={service}
          mode="override"
          value={value.availability}
          onChange={(availability) => onChange({ ...value, availability })}
          timezone={props.timezone?.zone}
          hideInherited
        />
        {props.timezone && value.availability.overriding && (
          <Text size="sm" c="dimmed">
            The time zone comes from {props.timezone.source}.
          </Text>
        )}
        {availabilityError && (
          <Text size="sm" c="red">
            {availabilityError}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
