// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Button, Group, Paper, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useId, useState } from 'react';
import type { SchedulingParameterValues } from '../parameterValues';
import {
  getHealthcareServiceSchedulingParameterValues,
  getScheduleSchedulingParameterValues,
  SCHEDULING_PARAMETER_DEFAULTS,
  setHealthcareServiceSchedulingParameterValues,
  setScheduleSchedulingParameterValues,
} from '../parameterValues';
import type {
  SchedulingParameter,
  SchedulingParameterLabels,
  SchedulingParameterWarning,
} from './SchedulingParametersEditor.utils';
import {
  getBlockingErrors,
  getInheritedDefaults,
  getSchedulingParameterWarnings,
  getVisibleParameters,
  validateSchedulingParameters,
} from './SchedulingParametersEditor.utils';
import { SchedulingParametersFields } from './SchedulingParametersFields';

interface CommonProps {
  /** Called when the user cancels. Omit to hide the cancel button, e.g. when the editor is inline on a page. */
  readonly onCancel?: () => void;
}

/**
 * Props for editing the parameters a Schedule overrides for one service. Scheduling ignores a Schedule's
 * parameters without a service to scope them to, so the service is required. The caller keeps the service
 * in `Schedule.serviceType`; the editor writes only the parameters.
 * @param schedule - The Schedule holding the override.
 * @param service - The visit service type the override applies to, whose values an empty field inherits.
 * @param onSave - Called with the updated Schedule when the user saves. The caller performs the write, and may
 * return a Promise to keep the save button in its pending state until the write settles. A rejection only ends
 * that state, so telling the user the write failed is the caller's to do.
 */
export interface ScheduleSchedulingParametersEditorProps extends CommonProps {
  readonly schedule: Schedule;
  readonly service: WithId<HealthcareService>;
  readonly onSave: (updatedSchedule: Schedule) => void | Promise<void>;
}

/**
 * Props for editing the parameters a visit service type sets for itself.
 * @param schedule - Omitted, which is what selects this mode.
 * @param service - The visit service type, which may be a draft not yet created.
 * @param onSave - Called with the updated HealthcareService, of the same type as `service`, when the user saves.
 * The caller performs the write, and may return a Promise to keep the save button in its pending state until the
 * write settles. A rejection only ends that state, so telling the user the write failed is the caller's to do.
 */
export interface HealthcareServiceSchedulingParametersEditorProps<
  T extends HealthcareService = HealthcareService,
> extends CommonProps {
  readonly schedule?: undefined;
  readonly service: T;
  readonly onSave: (updatedService: T) => void | Promise<void>;
}

/**
 * Props for the SchedulingParametersEditor component. Passing a Schedule edits that calendar's override of the
 * service's parameters; omitting it edits the service's own. Each level offers the fields the scheduling docs
 * recommend setting there, and any other field it already stores.
 */
export type SchedulingParametersEditorProps<T extends HealthcareService = HealthcareService> =
  ScheduleSchedulingParametersEditorProps | HealthcareServiceSchedulingParametersEditorProps<T>;

interface LevelConfig {
  readonly initial: SchedulingParameterValues;
  readonly defaults: SchedulingParameterValues;
  readonly defaultLabels: SchedulingParameterLabels;
  readonly visible: ReadonlySet<SchedulingParameter>;
  /** The service's own values, on a calendar's override. */
  readonly inherited?: SchedulingParameterValues;
}

function getLevelConfig<T extends HealthcareService>(props: SchedulingParametersEditorProps<T>): LevelConfig {
  if (props.schedule) {
    const initial = getScheduleSchedulingParameterValues(props.schedule, props.service);
    const inherited = getHealthcareServiceSchedulingParameterValues(props.service);
    const { defaults, labels } = getInheritedDefaults(inherited, props.service.name ?? 'visit type');
    return {
      initial,
      defaults,
      defaultLabels: labels,
      visible: getVisibleParameters('schedule', initial),
      inherited,
    };
  }
  const initial = getHealthcareServiceSchedulingParameterValues(props.service);
  return {
    initial,
    defaults: SCHEDULING_PARAMETER_DEFAULTS,
    defaultLabels: {},
    visible: getVisibleParameters('service', initial),
  };
}

/**
 * Renders a warning, with the field it names as a jump to that field.
 * @param props - The warning and the field id prefix.
 * @param props.warning - The warning to render.
 * @param props.idPrefix - The prefix the form's field ids are built from.
 * @returns The warning text.
 */
function WarningText(props: { readonly warning: SchedulingParameterWarning; readonly idPrefix: string }): JSX.Element {
  const { warning, idPrefix } = props;
  const at = warning.focus ? warning.message.indexOf(warning.focus.text) : -1;

  if (!warning.focus || at < 0) {
    return <>{warning.message}</>;
  }

  const { field, text } = warning.focus;
  return (
    <>
      {warning.message.slice(0, at)}
      <Anchor
        component="button"
        type="button"
        inherit
        onClick={() => document.getElementById(`${idPrefix}-${field}`)?.focus()}
        data-testid={`scheduling-parameters-warning-${warning.id}-focus`}
      >
        {text}
      </Anchor>
      {warning.message.slice(at + text.length)}
    </>
  );
}

/**
 * Edits scheduling parameters, either the ones a visit service type sets for itself or the ones a Schedule
 * overrides for that service.
 *
 * Working hours belong to ScheduleAvailabilityEditor.
 *
 * This renders form content only. The caller supplies the container, so the editor can live inline in a
 * page, in a Modal, or in a Drawer. The form is seeded once, so reset it by remounting with a `key`.
 * @param props - The service, an optional Schedule selecting what is edited, and save/cancel handlers
 * @returns The scheduling parameters editor form
 */
export function SchedulingParametersEditor<T extends HealthcareService = HealthcareService>(
  props: SchedulingParametersEditorProps<T>
): JSX.Element {
  const { schedule, service, onCancel } = props;
  const editingSchedule = schedule !== undefined;

  const [level] = useState(() => getLevelConfig(props));
  const { initial } = level;
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const reasonId = useId();
  const fieldIdPrefix = useId();

  const serviceName = service.name ?? 'this visit service type';

  const errors = validateSchedulingParameters(values);
  // Blocking is limited to fields the user changed: a value stored out of range through the API would
  // otherwise lock someone out of the whole form.
  const blocking = getBlockingErrors(errors, values, initial);
  const blocked = Object.keys(blocking).length > 0;
  const blockedReason = 'Fix the highlighted fields before saving.';
  // A warning only jumps to a field that is on the form.
  const warnings = getSchedulingParameterWarnings(values, initial, level.inherited).map((warning) =>
    warning.focus && !level.visible.has(warning.focus.field) ? { ...warning, focus: undefined } : warning
  );

  async function handleSave(): Promise<void> {
    if (blocked) {
      return;
    }
    setSaving(true);
    try {
      if (props.schedule) {
        await props.onSave(setScheduleSchedulingParameterValues(props.schedule, props.service, values));
      } else {
        await props.onSave(setHealthcareServiceSchedulingParameterValues(props.service, values));
      }
    } catch (err) {
      // Reporting a failed write is the caller's; this only keeps the rejection out of the event handler.
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Marked disabled without the attribute, which would drop the button out of the tab order and put the
  // tooltip explaining why out of reach. `handleSave` refuses to run regardless.
  const saveButton = (
    <Tooltip
      label={blockedReason}
      disabled={!blocked}
      multiline
      w={300}
      withArrow
      position="top"
      events={{ hover: true, focus: true, touch: true }}
    >
      <Button
        onClick={handleSave}
        loading={saving}
        fullWidth={!onCancel}
        data-disabled={blocked || undefined}
        aria-disabled={blocked || undefined}
        aria-describedby={blocked ? reasonId : undefined}
        data-testid="scheduling-parameters-save"
      >
        Save Settings
      </Button>
    </Tooltip>
  );

  return (
    <Stack gap="lg">
      <Text c="dimmed">
        {editingSchedule
          ? `Set how ${serviceName} is scheduled on this calendar. Leave a field empty to use the visit type's setting.`
          : `Set how ${serviceName} is scheduled. Every calendar offering it follows these unless it sets its own.`}
      </Text>

      <Paper withBorder radius="md" p="xl">
        <SchedulingParametersFields
          values={values}
          defaults={level.defaults}
          defaultLabels={level.defaultLabels}
          errors={blocking}
          idPrefix={fieldIdPrefix}
          onChange={setValues}
          visible={level.visible}
        />

        {warnings.length > 0 && (
          <Stack gap="xs" mt="xl" data-testid="scheduling-parameters-warnings">
            {warnings.map((warning) => (
              <Alert
                key={warning.id}
                color="yellow"
                variant="light"
                icon={<IconAlertTriangle />}
                data-testid={`scheduling-parameters-warning-${warning.id}`}
              >
                <WarningText warning={warning} idPrefix={fieldIdPrefix} />
              </Alert>
            ))}
          </Stack>
        )}
      </Paper>

      {blocked && (
        <VisuallyHidden id={reasonId} data-testid="scheduling-parameters-blocked">
          {blockedReason}
        </VisuallyHidden>
      )}

      {onCancel ? (
        <Group grow>
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          {saveButton}
        </Group>
      ) : (
        saveButton
      )}
    </Stack>
  );
}
