// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Group, Stack, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
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
import classes from './ActorPage.module.css';
import type { OfferingFields } from './scheduleDraft';
import { hasOverrides } from './scheduleDraft';

export interface OfferingSummaryProps {
  readonly service: WithId<HealthcareService>;
  readonly value: OfferingFields;
  /** The duration in effect and where the hours come from. */
  readonly summary: string;
  readonly dirty: boolean;
}

/**
 * One visit type an actor's Schedule offers, in a line: its name, whether the Schedule customizes it or holds
 * unsaved changes to it, and how it is scheduled.
 * @param props - The visit type, what the Schedule sets for it, and what to say about it.
 * @returns The summary.
 */
export function OfferingSummary(props: OfferingSummaryProps): JSX.Element {
  const { service, value, summary, dirty } = props;
  const serviceName = service.name ?? 'this visit type';
  return (
    <Stack gap={2}>
      <Group gap="xs" wrap="nowrap">
        <Text fw={600} truncate>
          {serviceName}
        </Text>
        {hasOverrides(value) && <OverridesBadge serviceName={serviceName} />}
        {dirty && (
          <>
            <Tooltip label="Unsaved changes" withArrow>
              <Box className={classes.dot} aria-hidden />
            </Tooltip>
            <VisuallyHidden>Unsaved changes</VisuallyHidden>
          </>
        )}
      </Group>
      <Text size="sm" c="dimmed" truncate>
        {summary}
      </Text>
    </Stack>
  );
}

export interface OfferingEditorProps {
  readonly service: WithId<HealthcareService>;
  readonly value: OfferingFields;
  /** What the Schedule set for the visit type when the page opened. */
  readonly initialParameters: SchedulingParameterValues;
  readonly onChange: (value: OfferingFields) => void;
  readonly errors: SchedulingParameterErrors;
  /** Why the hours can't be saved, once a save has been tried. */
  readonly availabilityError?: string;
  /** The time zone the hours are read in, and where it comes from. Absent when none resolves. */
  readonly timezone?: { readonly zone: string; readonly source: string };
}

/**
 * The Schedule's own parameters and hours for one visit type it offers.
 * @param props - The visit type, what the Schedule sets for it, and what to do when it changes.
 * @returns The editor.
 */
export function OfferingEditor(props: OfferingEditorProps): JSX.Element {
  const { service, value, initialParameters, onChange, errors, availabilityError } = props;
  const idPrefix = useId();
  const serviceName = service.name ?? 'this visit type';
  const serviceValues = getHealthcareServiceSchedulingParameterValues(service);
  const { defaults, labels } = getInheritedDefaults(serviceValues, serviceName);
  const warnings = getSchedulingParameterWarnings(value.parameters, initialParameters, serviceValues);

  return (
    <Stack gap="lg">
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
