// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  List,
  Paper,
  Stack,
  Switch,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useId, useState } from 'react';
import type { SchedulingParameterWarning } from './SchedulingParametersEditor.utils';
import {
  getHealthcareServiceSchedulingParameterValues,
  setHealthcareServiceSchedulingParameterValues,
} from '../parameterValues';
import {
  getBlockingErrors,
  getSchedulingParameterWarnings,
  SCHEDULING_PARAMETER_DEFAULTS,
  validateSchedulingParameters,
} from './SchedulingParametersEditor.utils';
import { SchedulingParametersFields } from './SchedulingParametersFields';

export interface SchedulingParametersEditorProps {
  /** The visit service type whose parameters are being edited. */
  readonly service: WithId<HealthcareService>;
  /**
   * Called with the updated HealthcareService when the user saves. The caller performs the write, and may
   * return a Promise to keep the save button in its pending state until the write settles. A rejection only
   * ends that state, so telling the user the write failed is the caller's to do.
   */
  readonly onSave: (updatedService: WithId<HealthcareService>) => void | Promise<void>;
  /** Called when the user cancels. Omit to hide the cancel button, e.g. when the editor is inline on a page. */
  readonly onCancel?: () => void;
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
 * Edits the scheduling parameters a visit service type sets for itself, and whether it can be booked at all.
 *
 * Every calendar offering the service follows these unless it overrides a parameter of its own. Working
 * hours are not here: they are the availability editor's, and a service holds them in `availableTime`.
 *
 * This renders form content only. The caller supplies the container, so the editor can live inline in a
 * page, in a Modal, or in a Drawer. The form is seeded once, so reset it by remounting with a `key`.
 * @param props - The service, and save/cancel handlers
 * @returns The scheduling parameters editor form
 */
export function SchedulingParametersEditor(props: SchedulingParametersEditorProps): JSX.Element {
  const { service, onSave, onCancel } = props;

  const [initial] = useState(() => getHealthcareServiceSchedulingParameterValues(service));
  const [values, setValues] = useState(initial);
  // Absent `active` counts as active, which is how scheduling reads it.
  const [active, setActive] = useState(service.active !== false);
  const [saving, setSaving] = useState(false);
  const reasonId = useId();
  const fieldIdPrefix = useId();

  const serviceName = service.name ?? 'this visit service type';
  const deactivating = active !== (service.active !== false);

  let saveLabel = 'Save Settings';
  if (deactivating) {
    saveLabel = active ? 'Save and reactivate' : 'Save and deactivate';
  }

  const errors = validateSchedulingParameters(values);
  // Blocking is limited to fields the user changed: a value stored out of range through the API would
  // otherwise lock someone out of the whole form, deactivating included.
  const blocking = getBlockingErrors(errors, values, initial);
  const blocked = Object.keys(blocking).length > 0;
  const blockedReason = 'Fix the highlighted fields before saving.';
  const warnings = getSchedulingParameterWarnings(values, initial);

  async function handleSave(): Promise<void> {
    if (blocked) {
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...setHealthcareServiceSchedulingParameterValues(service, values), active });
    } catch (err) {
      // The caller owns the write and so owns reporting its failure. This catch only keeps the rejection
      // from escaping an event handler that has nowhere to hand it.
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
        {saveLabel}
      </Button>
    </Tooltip>
  );

  return (
    <Stack gap="lg">
      <Text c="dimmed">
        Set how {serviceName} is scheduled. Every calendar offering it follows these unless it sets its own.
      </Text>

      <Paper withBorder radius="md" p="xl">
        <SchedulingParametersFields
          values={values}
          defaults={SCHEDULING_PARAMETER_DEFAULTS}
          defaultsLabel="default"
          errors={blocking}
          idPrefix={fieldIdPrefix}
          onChange={setValues}
          // Neither time zone is offered here: one belongs to each calendar, and the other is left at UTC so
          // calendars booked together agree. Either one already stored still takes effect, so both fields
          // appear together, read-only and removable, rather than a stored value going unseen.
          timezoneMode={
            initial.timezone === undefined && initial.alignmentTimezone === undefined ? 'hidden' : 'discouraged'
          }
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

      <Paper withBorder radius="md" p="md" data-testid="scheduling-parameters-status">
        <Group gap="sm" wrap="nowrap">
          <Switch
            checked={active}
            onChange={(e) => setActive(e.currentTarget.checked)}
            color="green.6"
            withThumbIndicator={false}
            aria-label={`${serviceName} is active`}
            data-testid="scheduling-parameters-active"
          />
          <Text fw={500}>Active</Text>
          <Badge color={active ? 'green' : 'gray'} variant="light">
            {active ? 'Bookable' : 'Not bookable'}
          </Badge>
        </Group>

        {!active && (
          <>
            <Divider my="lg" />
            <Alert
              color="yellow"
              variant="light"
              icon={<IconAlertTriangle />}
              data-testid="scheduling-parameters-deactivate-warning"
            >
              <List size="sm">
                <List.Item>New bookings stop on every calendar offering {serviceName}.</List.Item>
                <List.Item>Existing appointments are kept, and can still be cancelled.</List.Item>
                <List.Item>Appointments currently on hold can no longer be confirmed.</List.Item>
              </List>
            </Alert>
          </>
        )}

        {active && service.active === false && (
          <Text c="dimmed" size="sm" mt="md">
            Booking resumes as soon as this is saved.
          </Text>
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
