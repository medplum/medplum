// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Combobox,
  Group,
  HoverCard,
  Menu,
  NumberInput,
  Pill,
  PillsInput,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useCombobox,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { createReference, formatDate, formatDateTime, formatMoney } from '@medplum/core';
import type {
  Claim,
  ClaimDiagnosis,
  ClaimItem,
  Coding,
  Condition,
  Encounter,
  Practitioner,
  Reference,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import {
  AsyncAutocomplete,
  CodingInput,
  codingToValueSetElement,
  ResourceAvatar,
  ResourceName,
  useMedplum,
  useMedplumProfile,
  useResource,
  valueSetElementToCoding,
} from '@medplum/react';
import { IconArrowsSort, IconCheck, IconChevronDown, IconCirclePlus, IconInfoCircle, IconX } from '@tabler/icons-react';
import type { JSX, MouseEvent, ReactNode, SyntheticEvent } from 'react';
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CPT_COPYRIGHT_NOTICE, PROCEDURE_MODIFIERS_VALUE_SET } from '../../config/constants';
import { showErrorNotification } from '../../utils/notifications';
import type { ConditionsByCode } from './claimConditions';
import {
  CLINICAL_STATUSES,
  getClaimEncounter,
  getClinicalStatus,
  loadEncounterConditions,
  setClinicalStatus,
  syncEncounterDiagnoses,
} from './claimConditions';
import {
  addDiagnosis,
  addLine,
  getLineCharge,
  getLineUnitPrice,
  MAX_CLAIM_DIAGNOSES,
  MAX_DIAGNOSIS_POINTERS,
  moveDiagnosis,
  moveLine,
  removeDiagnosis,
  removeLine,
  replaceDiagnosis,
  updateLine,
} from './claimEditing';
import classes from './ClaimEditor.module.css';
import { DetailSection, MetaItem } from './DetailSection';
import sectionClasses from './DetailSection.module.css';
import { DiagnosisHistoryPopover, LineHistoryPopover } from './LineHistoryPopover';

const ICD10_BINDING = 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable';
const CPT_BINDING = 'http://www.ama-assn.org/go/cpt/vs';

export interface ClaimEditorProps {
  readonly claim: Claim;
  readonly onChange: (claim: Claim) => void;
}

function toDiagnosisLetter(sequence: number): string {
  return String.fromCodePoint(64 + sequence);
}

function formatDiagnosisPosition(position: number): string {
  return position === 1 ? `${toDiagnosisLetter(position)} (Principal)` : toDiagnosisLetter(position);
}

/**
 * The visit the claim bills, read-only: its practitioner, billing organization, service facility, place of service and
 * times. They're edited on the visit, which passes them on to the claims that can still change.
 * @param props - The ClaimVisitDetails React props.
 * @param props.claim - The claim.
 * @param props.showVisitLink - Whether to link to the visit; off when the claim is already open over it.
 * @returns The visit details section.
 */
export function ClaimVisitDetails(props: { readonly claim: Claim; readonly showVisitLink?: boolean }): JSX.Element {
  const { claim, showVisitLink = true } = props;
  const encounterRef = getClaimEncounter(claim);
  const encounter = useResource<Encounter>(encounterRef);
  const practitioner = getRenderingPractitioner(claim);
  const billingOrganization = claim.provider.reference?.startsWith('Organization/') ? claim.provider : undefined;
  const placeOfService = claim.item?.find((i) => i.locationCodeableConcept)?.locationCodeableConcept?.coding?.[0];
  const serviceDate = encounter?.period?.start ?? claim.billablePeriod?.start ?? claim.item?.[0]?.servicedDate;

  return (
    <DetailSection gap="sm" title="Visit Details">
      <div className={classes.metaGrid}>
        <MetaItem label="Visit Type" value={encounterRef ? getEncounterTitle(encounter) : '—'} />
        <MetaItem label="Date of Service" value={serviceDate ? formatDate(serviceDate) : '—'} />
        <MetaItem label="Practitioner" value={practitioner ? <ResourceName value={practitioner} /> : '—'} />
        <MetaItem
          label="Billing Organization"
          value={billingOrganization ? <ResourceName value={billingOrganization} /> : '—'}
        />
        <MetaItem label="Check In" value={formatVisitTime(encounter?.period?.start)} />
        <MetaItem label="Check Out" value={formatVisitTime(encounter?.period?.end)} />
        <MetaItem
          label="Service Facility"
          value={claim.facility ? <ResourceName value={claim.facility} /> : 'Same as billing organization'}
        />
        <MetaItem
          label="Place of Service"
          value={placeOfService ? [placeOfService.code, placeOfService.display].filter(Boolean).join(': ') : '—'}
        />
      </div>
      {showVisitLink && encounterRef?.reference && claim.patient.reference && (
        <div className={sectionClasses.footer}>
          <Button
            variant="light"
            fullWidth
            component={Link}
            to={`/${claim.patient.reference}/${encounterRef.reference}`}
          >
            View Visit
          </Button>
        </div>
      )}
    </DetailSection>
  );
}

/**
 * A check-in or check-out time, to the minute, e.g. "9:30 AM"; the date shows as the date of service.
 * @param dateTime - The time.
 * @returns The formatted time, or a dash when unset.
 */
function formatVisitTime(dateTime: string | undefined): string {
  return formatDateTime(dateTime, undefined, { hour: 'numeric', minute: '2-digit' }) || '—';
}

/**
 * Names an encounter by its service type, e.g. "Primary care"
 * @param encounter - The encounter, once loaded.
 * @returns The encounter's name.
 */
function getEncounterTitle(encounter: Encounter | undefined): string {
  const serviceType = encounter?.serviceType;
  const type = encounter?.type?.[0];
  return (
    serviceType?.text ??
    serviceType?.coding?.[0]?.display ??
    type?.text ??
    type?.coding?.[0]?.display ??
    encounter?.class?.display ??
    'Encounter'
  );
}

/**
 * The claim's rendering practitioner: the first care team member, else the provider when it is a practitioner.
 * @param claim - The claim.
 * @returns The practitioner reference, if the claim has one.
 */
function getRenderingPractitioner(claim: Claim): Reference<Practitioner> | undefined {
  const member = claim.careTeam?.find((c) => c.provider.reference?.startsWith('Practitioner/'))?.provider;
  if (member) {
    return member as Reference<Practitioner>;
  }
  return claim.provider.reference?.startsWith('Practitioner/')
    ? (claim.provider as Reference<Practitioner>)
    : undefined;
}

/**
 * The claim's diagnoses, lettered A to L. Picking another letter moves a diagnosis there (A is principal); clearing
 * its code removes it.
 * @param props - The ClaimEditor React props.
 * @param props.onConditionsChange - Called with the visit's Conditions, by code, as they load and change.
 * @returns The diagnosis section.
 */
export function ClaimDiagnosesEditor(
  props: ClaimEditorProps & {
    /** Called with the visit's Conditions, by code, each time they load or a diagnosis change reaches the visit. */
    readonly onConditionsChange?: (conditions: ConditionsByCode) => void;
    /** Shows the diagnoses without letting them change, e.g. once the visit's note is signed and locked. */
    readonly readOnly?: boolean;
  }
): JSX.Element {
  const { claim, onChange, onConditionsChange, readOnly } = props;
  const diagnoses = claim.diagnosis ?? [];
  const [adding, setAdding] = useState(false);
  const [focusNew, focusOnRender] = useFocusOnAdd();
  const medplum = useMedplum();
  const encounterRef = getClaimEncounter(claim);
  const encounterKey = encounterRef?.reference;
  const [conditions, setLoadedConditions] = useState<ConditionsByCode>();
  const onConditionsChangeRef = useRef(onConditionsChange);
  useEffect(() => {
    onConditionsChangeRef.current = onConditionsChange;
  }, [onConditionsChange]);
  const setConditions = useCallback((next: ConditionsByCode): void => {
    setLoadedConditions(next);
    onConditionsChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!encounterKey) {
      return undefined;
    }
    let active = true;
    loadEncounterConditions(medplum, { reference: encounterKey })
      .then((loaded) => active && setConditions(loaded))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, encounterKey, setConditions]);

  // Each change to the claim's diagnoses is mirrored on the visit, so the two lists stay in step. A diagnosis picked
  // from the patient's conditions links that Condition rather than making a new one.
  const changeDiagnoses = (next: Claim, picked?: WithId<Condition>): void => {
    onChange(next);
    if (encounterKey) {
      const known = new Map(conditions ?? []);
      const code = picked?.code?.coding?.[0]?.code;
      if (picked && code) {
        known.set(code, picked);
      }
      syncEncounterDiagnoses(medplum, next, { reference: encounterKey }, known)
        .then(setConditions)
        .catch(showErrorNotification);
    }
  };

  const changeStatus = async (code: string, status: Coding): Promise<void> => {
    if (!encounterKey) {
      return;
    }
    let byCode = new Map(conditions ?? []);
    if (!byCode.has(code)) {
      byCode = await syncEncounterDiagnoses(medplum, claim, { reference: encounterKey }, byCode);
    }
    const condition = byCode.get(code);
    if (condition) {
      byCode.set(code, await setClinicalStatus(medplum, condition, status));
    }
    setConditions(byCode);
  };

  const usedCodes = new Set(
    diagnoses.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code).filter((c): c is string => !!c)
  );
  const patientConditions = usePatientConditions(readOnly ? undefined : claim.patient);

  return (
    <UsedCodesContext.Provider value={usedCodes}>
      <DetailSection
        gap="sm"
        title="Diagnoses"
        description={readOnly && !diagnoses.length ? 'No diagnoses were added before the note was locked.' : undefined}
      >
        {(diagnoses.length > 0 || adding) && (
          <div className={classes.diagnosisGrid}>
            {diagnoses.map((d) => {
              const coding = d.diagnosisCodeableConcept?.coding?.[0];
              return (
                <div key={`${d.sequence}-${coding?.code}`} className={classes.diagnosisRow}>
                  <Text className={`${classes.letter} ${classes.colLetter}`}>{toDiagnosisLetter(d.sequence)}</Text>
                  <div className={classes.colInput}>
                    <DiagnosisInput
                      name={`diagnosis-${d.sequence}`}
                      disabled={readOnly}
                      defaultValue={coding}
                      existing={patientConditions}
                      onChange={(next, condition) =>
                        next.code &&
                        !usedCodes.has(next.code) &&
                        changeDiagnoses(replaceDiagnosis(claim, d.sequence, next), condition)
                      }
                    />
                  </div>
                  {encounterKey && (
                    <div className={classes.colStatus}>
                      <StatusMenu
                        label={`Status of ${coding?.code ?? 'diagnosis'}`}
                        status={
                          conditions
                            ? getClinicalStatus(coding?.code ? conditions.get(coding.code) : undefined)
                            : undefined
                        }
                        loading={!conditions}
                        disabled={readOnly}
                        onChange={(status) =>
                          coding?.code && changeStatus(coding.code, status).catch(showErrorNotification)
                        }
                      />
                    </div>
                  )}
                  {encounterKey && (
                    <div className={classes.colAuthor}>
                      {coding?.code ? (
                        <DiagnosisHistoryPopover
                          code={coding.code}
                          condition={conditions?.get(coding.code)}
                          claimId={claim.id}
                        />
                      ) : (
                        <DiagnosisAuthor condition={coding?.code ? conditions?.get(coding.code) : undefined} />
                      )}
                    </div>
                  )}
                  <div className={classes.colActions}>
                    {!readOnly && (
                      <RowActions
                        label={`Actions for ${coding?.code ?? 'diagnosis'}`}
                        format={formatDiagnosisPosition}
                        position={d.sequence}
                        count={diagnoses.length}
                        onMove={(position) => changeDiagnoses(moveDiagnosis(claim, d.sequence, position))}
                        onRemove={() => changeDiagnoses(removeDiagnosis(claim, d.sequence))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {adding && (
              <div className={classes.diagnosisRow}>
                <Text className={`${classes.letter} ${classes.colLetter}`} c="dimmed">
                  {toDiagnosisLetter(diagnoses.length + 1)}
                </Text>
                <div className={classes.colInput} ref={focusOnRender}>
                  <DiagnosisInput
                    key={diagnoses.length}
                    name="new-diagnosis"
                    existing={patientConditions}
                    onChange={(coding, condition) => {
                      if (coding.code && !usedCodes.has(coding.code)) {
                        changeDiagnoses(addDiagnosis(claim, coding), condition);
                        setAdding(false);
                      }
                    }}
                  />
                </div>
                <div className={classes.colActions}>
                  <RowActions
                    label="Actions for new diagnosis"
                    position={0}
                    count={0}
                    removeLabel="Cancel"
                    onMove={() => undefined}
                    onRemove={() => setAdding(false)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {!readOnly && !adding && diagnoses.length < MAX_CLAIM_DIAGNOSES && (
          <div className={sectionClasses.footer}>
            <Button
              variant="light"
              fullWidth
              leftSection={<IconCirclePlus size={16} />}
              onClick={() => {
                focusNew();
                setAdding(true);
              }}
            >
              Add a Diagnosis
            </Button>
          </div>
        )}
      </DetailSection>
    </UsedCodesContext.Provider>
  );
}

/**
 * The claim's service lines: each one's procedure code, modifiers, diagnosis pointers, units and unit price, with the
 * total to bill under them.
 * @param props - The ClaimEditor React props, and what to call a line: "Service Line" by default, or "Charge Item" on the
 * visit.
 * @returns The service lines section.
 */
export function ClaimLinesEditor(
  props: ClaimEditorProps & {
    readonly lineName?: string;
    /** A notice at the top of a line, e.g. that its charge item isn't on a claim. */
    readonly lineNotice?: (item: ClaimItem) => ReactNode;
  }
): JSX.Element {
  const { claim, onChange, lineName = 'Service Line', lineNotice } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [focusNewLine, focusLineOnRender] = useFocusOnAdd();
  const lines = claim.item ?? [];
  // The modifier list is short, so load it whole and match the code or meaning in any case.
  const loadModifiers = async (input: string, signal: AbortSignal): Promise<ValueSetExpansionContains[]> => {
    const valueSet = await medplum.valueSetExpand({ url: PROCEDURE_MODIFIERS_VALUE_SET, count: 1000 }, { signal });
    const search = input.trim().toLowerCase();
    return (valueSet.expansion?.contains ?? []).filter(
      (m) => !search || [m.code, m.display].some((text) => text?.toLowerCase().includes(search))
    );
  };
  const diagnoses = claim.diagnosis ?? [];
  // Remount the pointer inputs when the diagnoses change, since their letters move with them.
  const diagnosisKey = diagnoses.map((d) => d.diagnosisCodeableConcept?.coding?.[0]?.code).join('|');
  const loadPointers = async (input: string): Promise<ClaimDiagnosis[]> => {
    const search = input.trim().toLowerCase();
    return diagnoses.filter((d) =>
      [toDiagnosisLetter(d.sequence), ...getDiagnosisText(d)].some((text) => text.toLowerCase().includes(search))
    );
  };
  const total = lines.reduce((sum, item) => sum + getLineCharge(item), 0);
  const change = (item: ClaimItem, changes: Partial<ClaimItem>): void =>
    onChange(updateLine(claim, item.sequence, changes));
  const price = (units: number, unitPrice: number | undefined): Partial<ClaimItem> => ({
    quantity: { value: units },
    unitPrice: unitPrice === undefined ? undefined : { value: unitPrice, currency: 'USD' },
    net: unitPrice === undefined ? undefined : { value: unitPrice * units, currency: 'USD' },
  });

  return (
    <DetailSection gap="sm" title={`${lineName}s`}>
      {lines.map((item) => {
        const coding = item.productOrService?.coding?.[0];
        const units = item.quantity?.value ?? 1;
        const unitPrice = getLineUnitPrice(item);
        return (
          <Card key={`${item.sequence}-${coding?.code ?? 'new'}`} withBorder p="md" className={classes.line}>
            <Stack gap="sm">
              {lineNotice?.(item)}
              <div ref={focusLineOnRender}>
                <OtherLinesContext.Provider value={getOtherLineCodes(lines, item.sequence)}>
                  <CodingInput
                    name={`line-${item.sequence}-code`}
                    path="item.productOrService"
                    label="Procedure Code (CPT/HCPCS)"
                    clearable={false}
                    itemComponent={ProcedureCodeOption}
                    pillComponent={CodeNamePill}
                    binding={CPT_BINDING}
                    placeholder="Search CPT codes"
                    withHelpText={false}
                    defaultValue={coding}
                    onChange={(next) =>
                      change(item, { productOrService: next ? { coding: [next], text: next.display } : {} })
                    }
                  />
                </OtherLinesContext.Provider>
              </div>
              <MeasuredRow className={classes.lineFields}>
                {(rowWidth) => (
                  <>
                    <AsyncAutocomplete<ValueSetExpansionContains>
                      name={`line-${item.sequence}-modifiers`}
                      label="Modifiers"
                      clearable={false}
                      creatable={false}
                      toOption={toModifierOption}
                      loadOptions={loadModifiers}
                      placeholder={item.modifier?.length ? undefined : 'Select a modifier…'}
                      maxValues={4}
                      width={rowWidth}
                      position="bottom-start"
                      itemComponent={ModifierOption}
                      pillComponent={CodePill}
                      defaultValue={(item.modifier ?? [])
                        .map((m) => m.coding?.[0])
                        .filter((c) => c !== undefined)
                        .map(codingToValueSetElement)}
                      onChange={(values) =>
                        change(item, {
                          modifier: values.length
                            ? values.map((v) => ({ coding: [valueSetElementToCoding(v)] }))
                            : undefined,
                        })
                      }
                    />
                    <AsyncAutocomplete<ClaimDiagnosis>
                      key={diagnosisKey}
                      name={`line-${item.sequence}-pointers`}
                      label="Diagnosis Pointers"
                      placeholder={item.diagnosisSequence?.length ? undefined : 'Select a dx pointer…'}
                      maxValues={MAX_DIAGNOSIS_POINTERS}
                      clearable={false}
                      creatable={false}
                      width={rowWidth}
                      position="bottom-end"
                      toOption={toPointerOption}
                      loadOptions={loadPointers}
                      itemComponent={PointerOption}
                      pillComponent={CodePill}
                      defaultValue={diagnoses.filter((d) => item.diagnosisSequence?.includes(d.sequence))}
                      onChange={(selected) =>
                        change(item, {
                          diagnosisSequence: selected.length
                            ? selected.map((d) => d.sequence).sort((x, y) => x - y)
                            : undefined,
                        })
                      }
                    />
                  </>
                )}
              </MeasuredRow>
              <div className={classes.lineFields}>
                <div className={classes.lineFields}>
                  <NumberInput
                    label="Unit Price"
                    placeholder="0.00"
                    leftSection="$"
                    leftSectionWidth={22}
                    leftSectionProps={{ className: classes.currency }}
                    className={classes.priceInput}
                    decimalScale={2}
                    fixedDecimalScale
                    min={0}
                    thousandSeparator=","
                    hideControls
                    value={unitPrice ?? ''}
                    onChange={(value) => {
                      const amount = typeof value === 'number' ? value : Number.parseFloat(value.replaceAll(',', ''));
                      change(item, price(units, Number.isFinite(amount) ? amount : undefined));
                    }}
                  />
                  <NumberInput
                    label="Units"
                    placeholder="#"
                    min={1}
                    step={1}
                    allowDecimal={false}
                    value={item.quantity?.value ?? ''}
                    onChange={(value) => {
                      const next = typeof value === 'number' ? value : Number.parseInt(value, 10);
                      change(item, price(Number.isFinite(next) && next > 0 ? next : 1, unitPrice));
                    }}
                  />
                </div>
                <Group gap="sm" wrap="nowrap" align="flex-end">
                  <TextInput
                    label={<CalculatedPriceLabel />}
                    className={classes.grow}
                    readOnly
                    tabIndex={-1}
                    placeholder="$0.00"
                    value={unitPrice === undefined ? '' : formatMoney({ value: getLineCharge(item), currency: 'USD' })}
                  />
                  <Group gap={4} wrap="nowrap" className={classes.rowActions}>
                    <LineHistoryPopover item={item} claimId={claim.id} />
                    <RowActions
                      label={`Move line ${item.sequence}`}
                      position={item.sequence}
                      count={lines.length}
                      onMove={(position) => onChange(moveLine(claim, item.sequence, position))}
                      onRemove={() => onChange(removeLine(claim, item.sequence))}
                    />
                  </Group>
                </Group>
              </div>
            </Stack>
          </Card>
        );
      })}
      <div className={sectionClasses.footer}>
        <Button
          variant="light"
          fullWidth
          leftSection={<IconCirclePlus size={16} />}
          onClick={() => {
            focusNewLine();
            onChange(addLine(claim, profile && createReference(profile)));
          }}
        >
          Add a {lineName}
        </Button>
      </div>
      <Text size="xs" c="dimmed" ta="center">
        {CPT_COPYRIGHT_NOTICE}
      </Text>
      <Group justify="space-between" className={classes.total}>
        <Text size="sm" c="gray.7">
          Total Calculated Price to Bill
        </Text>
        <Text size="xl" fw={800}>
          {formatMoney({ value: total, currency: 'USD' })}
        </Text>
      </Group>
    </DetailSection>
  );
}

/**
 * The Calculated Price label, with a hover card on how the price is worked out.
 * @returns The label.
 */
function CalculatedPriceLabel(): JSX.Element {
  return (
    <HoverCard position="top-start" openDelay={200} withinPortal>
      <HoverCard.Target>
        <span className={classes.hintLabel}>
          Calculated Price
          <IconInfoCircle size={14} />
        </span>
      </HoverCard.Target>
      {/* A hover card so its link can be clicked, styled as one of our tooltips. */}
      <HoverCard.Dropdown maw={300} className={classes.tooltipCard}>
        Price calculated from your{' '}
        <Anchor component={Link} to="/settings/billing/charge-items" inherit>
          Charge Items
        </Anchor>
        , taking into account applied modifiers and patient&apos;s primary insurance plan.
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

/** The short code shown on an option or pill, and what it means. */
interface CodeParts {
  readonly code: string;
  readonly meaning?: string;
}

function getCodeParts(resource: ValueSetExpansionContains | ClaimDiagnosis): CodeParts {
  if ('sequence' in resource) {
    return { code: toDiagnosisLetter(resource.sequence), meaning: getDiagnosisText(resource).join(': ') };
  }
  return { code: resource.code ?? '', meaning: resource.display };
}

function getDiagnosisText(diagnosis: ClaimDiagnosis): string[] {
  const coding = diagnosis.diagnosisCodeableConcept?.coding?.[0];
  return [coding?.code, coding?.display ?? diagnosis.diagnosisCodeableConcept?.text].filter((t): t is string => !!t);
}

function toModifierOption(modifier: ValueSetExpansionContains): AsyncAutocompleteOption<ValueSetExpansionContains> {
  return { value: modifier.code ?? '', label: modifier.display ?? modifier.code ?? '', resource: modifier };
}

function toPointerOption(diagnosis: ClaimDiagnosis): AsyncAutocompleteOption<ClaimDiagnosis> {
  return { value: String(diagnosis.sequence), label: toDiagnosisLetter(diagnosis.sequence), resource: diagnosis };
}

/** A code in a dropdown: the code, then what it means. */
/** Codes already chosen elsewhere in the section, e.g. on other diagnoses, which their dropdowns check too. */
const UsedCodesContext = createContext<ReadonlySet<string>>(new Set());

/** For a service line's code dropdown: the other lines that already bill each code. */
const OtherLinesContext = createContext<ReadonlyMap<string, number[]>>(new Map());

/**
 * Maps each procedure code to the lines that bill it, leaving out one line.
 * @param lines - The claim's service lines.
 * @param exclude - The line whose dropdown this is for.
 * @returns Each code's other lines, in order.
 */
function getOtherLineCodes(lines: readonly ClaimItem[], exclude: number): ReadonlyMap<string, number[]> {
  const result = new Map<string, number[]>();
  for (const line of lines) {
    const code = line.productOrService?.coding?.[0]?.code;
    if (code && line.sequence !== exclude) {
      result.set(code, [...(result.get(code) ?? []), line.sequence]);
    }
  }
  return result;
}

function formatOtherLines(lines: readonly number[]): string {
  return lines.length === 1 ? `On line ${lines[0]}` : `On lines ${lines.join(', ')}`;
}

/**
 * Makes a dropdown option for codes: the code in a fixed-width column, so every description starts at the same place,
 * then the description.
 * @param codeWidth - The code column's width, wide enough for the input's longest code.
 * @returns The option component.
 */
export function makeCodeOption(
  codeWidth: string
): (props: AsyncAutocompleteOption<ValueSetExpansionContains | ClaimDiagnosis>) => JSX.Element {
  const CodeOption = forwardRef<HTMLDivElement, AsyncAutocompleteOption<ValueSetExpansionContains | ClaimDiagnosis>>(
    ({ resource, active, label: _label, ...others }, ref) => {
      const { code, meaning } = getCodeParts(resource);
      const usedElsewhere = useContext(UsedCodesContext);
      const otherLines = useContext(OtherLinesContext);
      const used = !active && usedElsewhere.has(code);
      return (
        <div
          ref={ref}
          {...others}
          className={classes.codeOption}
          data-used={used || undefined}
          onMouseDown={used ? stopEvent : undefined}
          onClick={used ? stopEvent : undefined}
        >
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600} w={codeWidth} style={{ flex: 'none' }}>
              {code}
            </Text>
            <MiddleTruncatedText text={meaning} />
            {otherLines.get(code) && (
              <Text size="sm" c="blue" style={{ flex: 'none' }}>
                {formatOtherLines(otherLines.get(code) ?? [])}
              </Text>
            )}
            {(active || usedElsewhere.has(code)) && <SelectedCheck />}
          </Group>
        </div>
      );
    }
  );
  return CodeOption as unknown as (
    props: AsyncAutocompleteOption<ValueSetExpansionContains | ClaimDiagnosis>
  ) => JSX.Element;
}

const DiagnosisCodeOption = makeCodeOption('5rem');
const ProcedureCodeOption = makeCodeOption('3.5rem');
const ModifierOption = makeCodeOption('1.5rem');
const PointerOption = makeCodeOption('1rem');

/**
 * A selected code, shown by the code alone, with what it means in a tooltip.
 * @param props - The pill props.
 * @param props.item - The selected code.
 * @param props.disabled - Whether the input is disabled.
 * @param props.onRemove - Removes the code.
 * @returns The pill.
 */
function CodePill(props: {
  readonly item: AsyncAutocompleteOption<ValueSetExpansionContains | ClaimDiagnosis>;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  const { code, meaning } = getCodeParts(props.item.resource);
  // A pointer's meaning already leads with its diagnosis code; a modifier's leads with its own.
  const tooltip = 'sequence' in props.item.resource || !meaning ? meaning : `${code}: ${meaning}`;
  const [offset, anchorToInput] = useInputAnchoredOffset();
  return (
    <Tooltip
      label={tooltip}
      disabled={!tooltip}
      openDelay={300}
      multiline
      maw={320}
      position="top-start"
      offset={offset}
    >
      <Pill withRemoveButton={!props.disabled} onRemove={props.onRemove} onMouseEnter={anchorToInput}>
        {code || props.item.label}
      </Pill>
    </Tooltip>
  );
}

/** The gap between a pill's tooltip and the top border of its input. */
const TOOLTIP_GAP = 3;

/**
 * Moves a pill's `top-start` tooltip just above its input's top border, left-aligned with the pill.
 * @returns The tooltip offset, and a mouse-enter handler for the pill that measures it.
 */
function useInputAnchoredOffset(): [{ mainAxis: number }, (e: MouseEvent<HTMLElement>) => void] {
  const [offset, setOffset] = useState({ mainAxis: TOOLTIP_GAP });
  const anchorToInput = useCallback((e: MouseEvent<HTMLElement>): void => {
    const input = e.currentTarget.closest('.mantine-Input-input');
    if (input) {
      const pill = e.currentTarget.getBoundingClientRect();
      const box = input.getBoundingClientRect();
      setOffset({ mainAxis: pill.top - box.top + TOOLTIP_GAP });
    }
  }, []);
  return [offset, anchorToInput];
}

/**
 * Focuses the first input of a row added by the user, once it renders.
 * @returns A function to call when the user adds a row, and a ref callback for each row's input wrapper.
 */
function useFocusOnAdd(): [() => void, (el: HTMLDivElement | null) => void] {
  const pending = useRef(false);
  const request = useCallback((): void => {
    pending.current = true;
  }, []);
  const focusOnRender = useCallback((el: HTMLDivElement | null): void => {
    if (el && pending.current) {
      pending.current = false;
      el.querySelector('input')?.focus();
    }
  }, []);
  return [request, focusOnRender];
}

/** Badge colors for a diagnosis's clinical status, matching the problem list in the patient summary. */
const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  recurrence: 'green',
  relapse: 'green',
  inactive: 'orange',
  remission: 'blue',
  resolved: 'teal',
};

/**
 * A diagnosis's clinical status, as a select-like button that opens a menu of statuses.
 * @param props - The menu props.
 * @param props.label - The button's accessible name.
 * @param props.status - The current status, if known.
 * @param props.loading - Whether the status is still loading.
 * @param props.disabled - Whether the status can't be changed yet.
 * @param props.onChange - Sets a new status.
 * @returns The button and its menu.
 */
function StatusMenu(props: {
  readonly label: string;
  readonly status?: Coding;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (status: Coding) => void;
}): JSX.Element {
  // A diagnosis with no Condition yet is about to get an active one, so it reads as active until then.
  const status = props.status ?? CLINICAL_STATUSES[0];
  // Shown like the patient summary's StatusBadge: the status code, with dashes as spaces.
  let text = status?.code?.replaceAll('-', ' ') ?? 'status';
  if (props.loading) {
    text = '…';
  }
  const color = status ? (STATUS_COLORS[status.code ?? ''] ?? 'gray') : 'gray';
  const inactive = props.disabled || props.loading;
  return (
    <div className={classes.statusSlot}>
      <Menu position="bottom-start" shadow="md" radius="md" width={160} withinPortal disabled={inactive}>
        <Menu.Target>
          <Badge
            component="button"
            type="button"
            variant="light"
            color={color}
            aria-label={props.label}
            disabled={inactive}
            rightSection={inactive ? undefined : <IconChevronDown size={12} />}
            className={classes.statusBadge}
          >
            {text}
          </Badge>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Status</Menu.Label>
          {CLINICAL_STATUSES.map((option) => (
            <Menu.Item
              key={option.code}
              rightSection={option.code === status?.code ? <SelectedCheck /> : undefined}
              onClick={() => option.code !== status?.code && props.onChange(option)}
            >
              <Text size="sm">{option.display}</Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

/**
 * Who added a diagnosis, as their avatar: their photo, or their initials gray on gray. Hovering shows their name and
 * when they added it.
 * @param props - The avatar props.
 * @param props.condition - The diagnosis's Condition on the visit, once loaded.
 * @returns The avatar, or an empty slot when the author isn't known.
 */
type PatientCondition = { condition: WithId<Condition>; coding: Coding & { code: string } };

/**
 * A diagnosis code picker. Its dropdown has two tabs, fixed above the results: the patient's existing conditions, and
 * new ICD-10 codes. The search filters whichever tab is open. An existing condition picked here is linked, not copied.
 * @param props - The DiagnosisInput React props.
 * @param props.name - The input's name.
 * @param props.defaultValue - The diagnosis's code, if it has one.
 * @param props.disabled - Whether it can't be changed.
 * @param props.existing - The patient's conditions.
 * @param props.onChange - Called with the picked code, and its condition when it's an existing one.
 * @returns The input.
 */
function DiagnosisInput(props: {
  readonly name: string;
  readonly defaultValue?: Coding;
  readonly disabled?: boolean;
  readonly existing: PatientCondition[];
  readonly onChange: (coding: Coding, condition?: WithId<Condition>) => void;
}): JSX.Element {
  const { name, disabled, existing, onChange } = props;
  const medplum = useMedplum();
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const [value, setValue] = useState<Coding | undefined>(props.defaultValue);
  const [search, setSearch] = useState('');
  // Opens on the patient's conditions when they have any, once they've loaded.
  const [chosenTab, setTab] = useState<'existing' | 'new'>();
  const tab = chosenTab ?? (existing.length ? 'existing' : 'new');
  const [found, setFound] = useState<ValueSetExpansionContains[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // New codes come from the ICD-10 value set while the dropdown is open, filtered as you type.
  const opened = combobox.dropdownOpened;
  useEffect(() => {
    const filter = search.trim();
    if (tab !== 'new' || !opened) {
      setFound([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      medplum
        .valueSetExpand({ url: ICD10_BINDING, ...(filter ? { filter } : {}), count: 20 }, { signal: controller.signal })
        .then((valueSet) => setFound(valueSet.expansion?.contains ?? []))
        .catch((err) => !controller.signal.aborted && showErrorNotification(err))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [medplum, search, tab, opened]);

  const query = search.trim().toLowerCase();
  const options: ValueSetExpansionContains[] =
    tab === 'existing'
      ? existing
          .map(({ coding }) => coding)
          .filter((c) => !query || [c.code, c.display].some((t) => t?.toLowerCase().includes(query)))
      : found;

  const select = (code: string): void => {
    const option = options.find((o) => o.code === code);
    if (!option?.code) {
      return;
    }
    const coding: Coding = { system: option.system, code: option.code, display: option.display };
    setValue(coding);
    setSearch('');
    combobox.closeDropdown();
    onChange(coding, tab === 'existing' ? existing.find((e) => e.coding.code === code)?.condition : undefined);
  };

  let empty: string | undefined;
  if (!options.length) {
    if (tab === 'existing') {
      empty = existing.length ? 'No matching conditions' : 'The patient has no active conditions';
    } else if (!loading) {
      empty = 'Nothing found';
    }
  }

  return (
    <Combobox store={combobox} onOptionSubmit={select} withinPortal shadow="md" radius="md">
      <Combobox.DropdownTarget>
        <PillsInput disabled={disabled} onClick={() => combobox.openDropdown()}>
          <Pill.Group>
            {value && (
              <CodeNamePill
                item={{ value: value.code ?? '', label: value.display ?? '', resource: value }}
                disabled={disabled}
                onRemove={() => setValue(undefined)}
              />
            )}
            {!disabled && !value && (
              <Combobox.EventsTarget>
                <PillsInput.Field
                  role="searchbox"
                  name={name}
                  value={search}
                  placeholder="Search ICD-10 codes"
                  onFocus={() => combobox.openDropdown()}
                  ref={inputRef}
                  onBlur={(e) => {
                    // Switching tabs moves focus into the dropdown; that shouldn't close it.
                    if (dropdownRef.current?.contains(e.relatedTarget)) {
                      return;
                    }
                    combobox.closeDropdown();
                    setSearch('');
                  }}
                  onChange={(e) => {
                    setSearch(e.currentTarget.value);
                    combobox.openDropdown();
                    combobox.resetSelectedOption();
                  }}
                />
              </Combobox.EventsTarget>
            )}
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown p={0} ref={dropdownRef}>
        {/* Fixed above the results; pressing a tab keeps the search focused. */}
        <div className={classes.dropdownHeader} onMouseDown={(e) => e.preventDefault()}>
          <div style={{ padding: 'var(--mantine-spacing-xs)' }}>
            {/* Styled like the patient export form's toggles. */}
            <SegmentedControl
              fullWidth
              radius="xl"
              styles={{ indicator: { boxShadow: 'none' } }}
              value={tab}
              onChange={(next) => {
                setTab(next === 'new' ? 'new' : 'existing');
                combobox.resetSelectedOption();
                // Back to the search, so typing keeps filtering the open tab.
                inputRef.current?.focus();
              }}
              data={[
                { value: 'existing', label: 'Existing Diagnosis' },
                { value: 'new', label: 'New Diagnosis' },
              ]}
            />
          </div>
        </div>
        <Combobox.Options p={4}>
          <ScrollArea.Autosize mah={240} type="scroll">
            {options.map((option) => (
              <Combobox.Option value={option.code ?? ''} key={option.code}>
                <DiagnosisCodeOption
                  value={option.code ?? ''}
                  label={option.display ?? ''}
                  resource={option}
                  active={option.code === value?.code}
                />
              </Combobox.Option>
            ))}
            {loading && !options.length && <Combobox.Empty>Searching…</Combobox.Empty>}
            {empty && <Combobox.Empty>{empty}</Combobox.Empty>}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

/**
 * The patient's active conditions with an ICD-10 code, one per code, to pick from when adding a diagnosis.
 * @param patient - The patient; none to skip loading.
 * @returns Each condition with its ICD-10 coding, as a claim diagnosis carries it.
 */
function usePatientConditions(patient: Reference | undefined): PatientCondition[] {
  const medplum = useMedplum();
  const [found, setFound] = useState<WithId<Condition>[]>([]);
  const patientRef = patient?.reference;
  useEffect(() => {
    if (!patientRef) {
      return undefined;
    }
    let active = true;
    medplum
      .searchResources('Condition', { patient: patientRef, 'clinical-status': 'active', _count: '50' })
      .then((results) => active && setFound(results))
      .catch(showErrorNotification);
    return () => {
      active = false;
    };
  }, [medplum, patientRef]);

  const byCode = new Map<string, PatientCondition>();
  for (const condition of patientRef ? found : []) {
    const icd = condition.code?.coding?.find((c) => c.system?.includes('icd-10')) ?? condition.code?.coding?.[0];
    if (icd?.code && !byCode.has(icd.code)) {
      byCode.set(icd.code, {
        condition,
        coding: { system: icd.system, code: icd.code, display: icd.display ?? condition.code?.text },
      });
    }
  }
  return [...byCode.values()];
}

function DiagnosisAuthor(props: { readonly condition?: Condition }): JSX.Element {
  const { condition } = props;
  return (
    <AuthorAvatar
      author={condition?.recorder ?? condition?.asserter ?? condition?.meta?.author}
      added={condition?.recordedDate}
    />
  );
}

/**
 * Who added a row, as their avatar: their photo, or their initials gray on gray. Hovering shows their name and when.
 * @param props - The avatar props.
 * @param props.author - Who added the row.
 * @param props.added - When they added it.
 * @returns The avatar, or an empty slot when the author isn't known.
 */
function AuthorAvatar(props: { readonly author?: Reference; readonly added?: string }): JSX.Element {
  const { author, added } = props;
  if (!author) {
    return <div className={classes.authorSlot} />;
  }
  return (
    <div className={classes.authorSlot}>
      <Tooltip
        position="top"
        openDelay={200}
        label={
          <div className={classes.authorTip}>
            <div>
              Added by <ResourceName value={author} inherit />
            </div>
            {added && <div>{formatDateTime(added)}</div>}
          </div>
        }
      >
        {/* An empty alt keeps the browser's own tooltip off the initials; the Tooltip names the author. */}
        <ResourceAvatar value={author} radius="xl" size={28} alt="" aria-label="Added by" />
      </Tooltip>
    </div>
  );
}

/**
 * A row's reorder menu: move it to another position, or remove it.
 * @param props - The menu props.
 * @param props.label - The button's accessible name.
 * @param props.position - The row's current 1-based position.
 * @param props.count - How many rows there are.
 * @param props.format - Shows a position, e.g. as a diagnosis letter; numbers by default.
 * @param props.removeLabel - The remove item's text; "Remove" by default.
 * @param props.onMove - Moves the row to the chosen position.
 * @param props.onRemove - Removes the row.
 * @returns The button and its menu.
 */
function RowActions(props: {
  readonly label: string;
  readonly position: number;
  readonly count: number;
  /** Shows a position in the menu; numbers by default. */
  readonly format?: (position: number) => string;
  readonly removeLabel?: string;
  readonly onMove: (position: number) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  // With nothing to reorder against, it's just a remove button.
  if (props.count <= 1) {
    return (
      <Tooltip label={props.removeLabel ?? 'Remove'} openDelay={500}>
        <ActionIcon
          variant="subtle"
          color="gray"
          radius="xl"
          my={4}
          aria-label={props.label}
          className={classes.quietDisabled}
          onClick={props.onRemove}
        >
          <IconX size={16} stroke={2} className={classes.removeIcon} />
        </ActionIcon>
      </Tooltip>
    );
  }
  return (
    <Menu position="bottom-end" shadow="md" radius="md" width={180} withinPortal>
      <Tooltip label="Reorder" openDelay={500}>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            my={4}
            aria-label={props.label}
            className={classes.quietDisabled}
          >
            <IconArrowsSort size={16} stroke={2} className={classes.removeIcon} />
          </ActionIcon>
        </Menu.Target>
      </Tooltip>
      <Menu.Dropdown>
        {props.count > 1 && (
          <>
            <Menu.Label>Line Order</Menu.Label>
            {Array.from({ length: props.count }, (_, i) => i + 1).map((position) => (
              <Menu.Item
                key={position}
                rightSection={position === props.position ? <SelectedCheck /> : undefined}
                onClick={() => position !== props.position && props.onMove(position)}
              >
                <Text size="sm">{props.format ? props.format(position) : position}</Text>
              </Menu.Item>
            ))}
            <Menu.Divider />
          </>
        )}
        <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={props.onRemove}>
          {props.removeLabel ?? 'Remove'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** How much of the end of a long description stays visible when its middle is cut. */
const DESCRIPTION_TAIL = 28;

/**
 * Text on one line that, when it doesn't fit, cuts its middle so both its start and end stay visible, with the
 * full text in a tooltip.
 * @param props - The text props.
 * @param props.text - The text.
 * @returns The text.
 */
function MiddleTruncatedText(props: { readonly text?: string }): JSX.Element {
  const text = props.text ?? '';
  const split = text.length > DESCRIPTION_TAIL * 2 ? text.lastIndexOf(' ', text.length - DESCRIPTION_TAIL) : -1;
  const head = split > 0 ? text.slice(0, split) : text;
  const tail = split > 0 ? text.slice(split) : '';
  const [overflows, setOverflows] = useState(false);
  // Measured once the dropdown lays the text out, so the tooltip is ready for the first hover.
  const measure = useCallback((el: HTMLElement | null): void => {
    if (el) {
      setOverflows(el.scrollWidth > el.clientWidth);
    }
  }, []);
  return (
    <Tooltip
      label={text}
      disabled={!overflows}
      openDelay={300}
      multiline
      maw={320}
      position="top-start"
      withinPortal
      offset={8}
    >
      <Group gap={0} wrap="nowrap" flex={1} miw={0} fz="sm" className={classes.description}>
        <span ref={measure} className={classes.head}>
          {head}
        </span>
        {tail && <span className={classes.tail}>{tail}</span>}
      </Group>
    </Tooltip>
  );
}

function stopEvent(e: SyntheticEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * The check on the selected item of a menu or dropdown, as in the Tasks filter menu.
 * @returns The check.
 */
function SelectedCheck(): JSX.Element {
  return <IconCheck size={16} color="var(--mantine-color-blue-6)" style={{ flex: 'none' }} />;
}

/**
 * A selected code shown with its name, cut to fit, with the full text in a tooltip when it doesn't fit.
 * @param props - The pill props.
 * @param props.item - The selected code.
 * @param props.disabled - Whether the input is disabled.
 * @param props.onRemove - Clears the code.
 * @returns The pill.
 */
export function CodeNamePill(props: {
  readonly item: AsyncAutocompleteOption<ValueSetExpansionContains>;
  readonly disabled?: boolean;
  readonly onRemove: () => void;
}): JSX.Element {
  const { code, display } = props.item.resource;
  const text = [code, display].filter(Boolean).join(': ') || props.item.label;
  const [overflows, setOverflows] = useState(false);
  const measure = useCallback((el: HTMLDivElement | null): void => {
    const label = el?.querySelector<HTMLElement>('.mantine-Pill-label');
    if (label) {
      setOverflows(label.scrollWidth > label.clientWidth);
    }
  }, []);
  const [offset, anchorToInput] = useInputAnchoredOffset();
  return (
    <Tooltip
      label={text}
      disabled={!overflows}
      openDelay={300}
      multiline
      maw={320}
      position="top-start"
      offset={offset}
    >
      <Pill
        ref={measure}
        maw="100%"
        withRemoveButton={!props.disabled}
        onRemove={props.onRemove}
        onMouseEnter={anchorToInput}
      >
        {text}
      </Pill>
    </Tooltip>
  );
}

/**
 * A row that hands its width to its children, so their dropdowns can span the whole row.
 * @param props - The row props.
 * @param props.className - The row's class.
 * @param props.children - Renders the row's content, given its width.
 * @returns The row.
 */
function MeasuredRow(props: {
  readonly className?: string;
  readonly children: (width: number | undefined) => ReactNode;
}): JSX.Element {
  const { ref, width } = useElementSize();
  return (
    <div ref={ref} className={props.className}>
      {props.children(width || undefined)}
    </div>
  );
}
