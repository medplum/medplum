// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Accordion, Box, Group, Stack, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core';
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
import { describeOverrides } from './scheduleDraft';

export interface OfferingEntryProps {
  readonly service: WithId<HealthcareService>;
  readonly value: OfferingFields;
  /** What the Schedule set for the visit type when the page opened. */
  readonly initial: OfferingFields;
  readonly onChange: (value: OfferingFields) => void;
  /** The duration in effect and where the hours come from, for the closed entry. */
  readonly summary: string;
  readonly dirty: boolean;
  readonly errors: SchedulingParameterErrors;
  /** Why the hours can't be saved, once a save has been tried. */
  readonly availabilityError?: string;
  /** The time zone the hours are read in, and where it comes from. Absent when none resolves. */
  readonly timezone?: { readonly zone: string; readonly source: string };
}

/**
 * One visit type an actor's Schedule offers, as an entry of the page's accordion: a line saying how it is
 * scheduled while closed, and the Schedule's own parameters and hours for it while open.
 * @param props - The visit type, what the Schedule sets for it, and what to say about it.
 * @returns The entry.
 */
export function OfferingEntry(props: OfferingEntryProps): JSX.Element {
  const { service, value, initial, onChange, summary, dirty, errors, availabilityError } = props;
  const idPrefix = useId();
  const serviceName = service.name ?? 'this visit type';
  const serviceValues = getHealthcareServiceSchedulingParameterValues(service);
  const { defaults, labels } = getInheritedDefaults(serviceValues, serviceName);
  const initialParameters: SchedulingParameterValues = initial.parameters;
  const warnings = getSchedulingParameterWarnings(value.parameters, initialParameters, serviceValues);

  return (
    <Accordion.Item value={service.id}>
      <Accordion.Control>
        <Stack gap={2}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} truncate>
              {serviceName}
            </Text>
            <OverridesBadge overrides={describeOverrides(value)} serviceName={serviceName} />
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
      </Accordion.Control>
      <Accordion.Panel>
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
            />
            {props.timezone && (
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
      </Accordion.Panel>
    </Accordion.Item>
  );
}
