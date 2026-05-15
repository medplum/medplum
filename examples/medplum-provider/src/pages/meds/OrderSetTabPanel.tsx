// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Input,
  List,
  NumberInput,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Condition, Coverage, Organization, Patient, PlanDefinition, Practitioner } from '@medplum/fhirtypes';
import { ResourceInput, useMedplum } from '@medplum/react';
import { SCRIPTSURE_ORDERSET_ID_SYSTEM, useScriptSureOrderSet } from '@medplum/scriptsure-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { OptionalContextFields } from './OrderMedicationPage';

export interface OrderSetTabPanelProps {
  readonly patient: Patient | undefined;
  readonly requester: Practitioner | undefined;
  readonly onPatientChange: (p: Patient | undefined) => void;
  readonly onRequesterChange: (p: Practitioner | undefined) => void;
  readonly onOrderComplete?: (result: { launchUrl: string; medicationRequestId?: string }) => void;
}

/**
 * Reads the ScriptSure orderset id stamped on a `PlanDefinition` by Bot 2
 * (`scriptsure-orderset-sync-bot`). Returns `undefined` when the PD has not
 * been synced — in that case the user must use the "Use ScriptSure id directly"
 * escape hatch below.
 *
 * @param pd - PlanDefinition picked by the user.
 * @returns Numeric ScriptSure orderset id, or undefined when not synced.
 */
function getScriptSureOrdersetIdFromPd(pd: PlanDefinition | undefined): number | undefined {
  if (!pd) {
    return undefined;
  }
  const raw = pd.identifier?.find((i) => i.system === SCRIPTSURE_ORDERSET_ID_SYSTEM)?.value;
  if (!raw) {
    return undefined;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function actionTitle(action: NonNullable<PlanDefinition['action']>[number]): string {
  return action.title?.trim() || action.description?.trim() || action.definitionCanonical || 'Untitled action';
}

/**
 * Custom dropdown option for the PlanDefinition picker. Prefers FHIR `title`
 * (the human label) over `name` (computer-friendly identifier) — Medplum's
 * default `getDisplayString` returns `name` first which surfaces ugly
 * computer-friendly strings like `OrderSet_377` in the dropdown when a
 * `title` like "Ozempic Plus" is available.
 *
 * @param props - Async-autocomplete option carrying the PlanDefinition.
 * @param props.resource - The PlanDefinition being rendered as a dropdown option.
 * @returns Two-line dropdown row: title (or fallback) on top, id below.
 */
function renderPlanDefinitionOption(props: { resource: PlanDefinition }): JSX.Element {
  const pd = props.resource;
  const primary = pd.title?.trim() || pd.name?.trim() || getReferenceString(pd) || 'PlanDefinition';
  return (
    <Stack gap={2}>
      <Text size="sm" fw={500}>
        {primary}
      </Text>
      <Text size="xs" c="dimmed">
        {pd.id}
      </Text>
    </Stack>
  );
}

export interface OrderSetPreflightSummaryProps {
  pd: PlanDefinition | undefined;
  scriptSureIdEscape: number | undefined;
}

/**
 * Read-only block showing drug count, each action's title, and a sync-status
 * badge for the picked PlanDefinition (or an escape-hatch message when only
 * a ScriptSure id was entered).
 *
 * @param props - Picked PlanDefinition and/or ScriptSure id escape-hatch value.
 * @returns Summary card, or `null` when neither is set.
 */
export function OrderSetPreflightSummary(props: Readonly<OrderSetPreflightSummaryProps>): JSX.Element | null {
  const { pd, scriptSureIdEscape } = props;
  if (!pd && scriptSureIdEscape === undefined) {
    return null;
  }

  if (!pd) {
    return (
      <Paper withBorder p="sm">
        <Stack gap={4}>
          <Text fw={600} size="sm">
            Pre-flight summary
          </Text>
          <Text size="sm">Using ScriptSure orderset id #{scriptSureIdEscape} directly. No PlanDefinition picked.</Text>
        </Stack>
      </Paper>
    );
  }

  const actions = pd.action ?? [];
  const ssId = getScriptSureOrdersetIdFromPd(pd);
  const synced = ssId !== undefined;

  return (
    <Paper withBorder p="sm" data-testid="orderset-preflight-summary">
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={600} size="sm">
              {pd.title ?? 'Order set'}
            </Text>
            <Text size="xs" c="dimmed">
              {actions.length} drug action{actions.length === 1 ? '' : 's'}
            </Text>
          </Stack>
          {synced ? (
            <Badge color="teal" variant="light" size="sm">
              Synced (orderset {ssId})
            </Badge>
          ) : (
            <Badge color="yellow" variant="light" size="sm">
              Not synced
            </Badge>
          )}
        </Group>

        {actions.length > 0 ? (
          <List size="xs" spacing={2} withPadding>
            {actions.map((a, i) => (
              <List.Item key={a.id ?? a.definitionCanonical ?? i}>{actionTitle(a)}</List.Item>
            ))}
          </List>
        ) : (
          <Text size="xs" c="dimmed">
            This PlanDefinition has no `action[]` entries.
          </Text>
        )}

        {!synced && (
          <Alert color="yellow" variant="light" p="xs" radius="sm">
            <Text size="xs">
              This order set hasn’t been synced to ScriptSure yet. Pick a synced PlanDefinition or enter the ScriptSure
              orderset id directly below.
            </Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * "Order set" tab body — picks an orderset (Medplum PlanDefinition or
 * ScriptSure id directly), shows a pre-flight summary, and on submit
 * forwards the bot's widget URL to the parent page via `onOrderComplete`.
 *
 * The ScriptSure order-set bot owns the per-drug review/edit/sign workflow
 * inside the iframe, so this panel does not duplicate per-drug controls.
 *
 * @param props - Patient/requester state (lifted from `OrderMedicationPage`),
 *   plus the order-complete callback that opens the parent's iframe modal.
 * @returns Tab body.
 */
export function OrderSetTabPanel(props: Readonly<OrderSetTabPanelProps>): JSX.Element {
  const { patient, requester, onPatientChange, onRequesterChange, onOrderComplete } = props;
  const medplum = useMedplum();

  const [planDefinition, setPlanDefinition] = useState<PlanDefinition | undefined>();
  const [scriptSureIdEscape, setScriptSureIdEscape] = useState<number | undefined>();
  const [showEscapeHatch, setShowEscapeHatch] = useState(false);

  const [primaryCondition, setPrimaryCondition] = useState<Condition | undefined>();
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [pharmacyOrg, setPharmacyOrg] = useState<Organization | undefined>();

  const [submitting, setSubmitting] = useState(false);

  const pdScriptSureId = getScriptSureOrdersetIdFromPd(planDefinition);
  const planDefinitionIdInput = planDefinition?.id && pdScriptSureId !== undefined ? planDefinition.id : undefined;

  const { url, loading, error, refresh } = useScriptSureOrderSet({
    patientId: patient?.id,
    planDefinitionId: planDefinitionIdInput,
    scriptSureOrdersetId: planDefinitionIdInput ? undefined : scriptSureIdEscape,
  });

  const submitDisabled = !patient?.id || !requester || (!planDefinitionIdInput && scriptSureIdEscape === undefined);
  const summaryWarnUnsynced =
    Boolean(planDefinition) && pdScriptSureId === undefined && scriptSureIdEscape === undefined;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (submitDisabled) {
      return;
    }
    setSubmitting(true);
    try {
      // Always refresh so the parent's PrescriptionIFrameModal opens with a
      // freshly-minted ScriptSure session token (Bot 1 is naturally idempotent).
      const fresh = (await refresh()) ?? url;
      if (!fresh) {
        showErrorNotification(error ?? new Error('Failed to build order-set widget URL'));
        return;
      }
      onOrderComplete?.({ launchUrl: fresh });
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setSubmitting(false);
    }
  }, [submitDisabled, refresh, url, error, onOrderComplete]);

  return (
    <Stack gap="md" data-testid="orderset-tab-panel">
      <Input.Wrapper label="Patient" required>
        <ResourceInput<Patient>
          key={patient?.id ?? 'patient-orderset'}
          resourceType="Patient"
          name="patient-orderset"
          defaultValue={patient}
          onChange={onPatientChange}
        />
      </Input.Wrapper>

      <Input.Wrapper label="Requester" required>
        <ResourceInput<Practitioner>
          key={requester?.id ?? 'requester-orderset'}
          resourceType="Practitioner"
          name="requester-orderset"
          defaultValue={requester}
          onChange={onRequesterChange}
        />
      </Input.Wrapper>

      <Input.Wrapper
        label="Order set"
        description="Shared PlanDefinitions of type `order-set` (synced with ScriptSure)"
        required
      >
        <ResourceInput<PlanDefinition>
          key={planDefinition?.id ?? 'plan-definition-orderset'}
          resourceType="PlanDefinition"
          name="plan-definition-orderset"
          defaultValue={planDefinition}
          searchCriteria={{ type: 'order-set', status: 'active', context: 'shared' }}
          itemComponent={renderPlanDefinitionOption}
          onChange={(pd) => {
            setPlanDefinition(pd);
            // Picking a PD clears the manual escape hatch so the active
            // selection always has exactly one source.
            if (pd) {
              setScriptSureIdEscape(undefined);
            }
          }}
        />
      </Input.Wrapper>

      <Box>
        <UnstyledButton onClick={() => setShowEscapeHatch((v) => !v)}>
          <Text size="xs" c="dimmed">
            {showEscapeHatch ? '▾' : '▸'} Use ScriptSure orderset id directly (escape hatch for un-synced sets)
          </Text>
        </UnstyledButton>
        <Collapse in={showEscapeHatch} mt="xs">
          <NumberInput
            label="ScriptSure orderset id"
            description="Use when the PlanDefinition picker can’t find your set. Disables PD selection while non-empty."
            value={scriptSureIdEscape ?? ''}
            onChange={(v) => {
              const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
              const next = Number.isFinite(n) && n > 0 ? n : undefined;
              setScriptSureIdEscape(next);
              if (next !== undefined) {
                setPlanDefinition(undefined);
              }
            }}
            min={1}
            allowNegative={false}
            allowDecimal={false}
          />
        </Collapse>
      </Box>

      <OrderSetPreflightSummary pd={planDefinition} scriptSureIdEscape={scriptSureIdEscape} />

      <OptionalContextFields
        medplum={medplum}
        patient={patient}
        primaryCondition={primaryCondition}
        setPrimaryCondition={setPrimaryCondition}
        coverage={coverage}
        setCoverage={setCoverage}
        pharmacyOrg={pharmacyOrg}
        setPharmacyOrg={setPharmacyOrg}
      />

      {error ? (
        <Alert color="red" variant="light" p="xs" radius="sm">
          <Text size="xs">Failed to build widget URL — see browser console for details.</Text>
        </Alert>
      ) : null}

      <Button
        onClick={() => {
          handleSubmit().catch(showErrorNotification);
        }}
        loading={loading || submitting}
        disabled={submitDisabled}
        title={
          summaryWarnUnsynced
            ? 'This order set hasn’t been synced to ScriptSure yet — pick a synced PlanDefinition or use the ScriptSure-id escape hatch.'
            : undefined
        }
      >
        Open prescribing widget
      </Button>
    </Stack>
  );
}
