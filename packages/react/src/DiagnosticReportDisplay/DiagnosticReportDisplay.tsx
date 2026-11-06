// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Avatar, Divider, Group, List, Stack, Text, Title } from '@mantine/core';
import type { MedplumClient, WithId } from '@medplum/core';
import {
  formatAddress,
  formatCodeableConcept,
  formatDateTime,
  formatHumanName,
  formatObservationValue,
  getDisplayString,
  getImageSrc,
  isReference,
  isResource,
  stringify,
} from '@medplum/core';
import type {
  Annotation,
  CareTeam,
  DiagnosticReport,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Organization,
  OrganizationContact,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
  RelatedPerson,
  Resource,
  Specimen,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AddressDisplay } from '../AddressDisplay/AddressDisplay';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { ContactPointDisplay } from '../ContactPointDisplay/ContactPointDisplay';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { NoteDisplay } from '../NoteDisplay/NoteDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';
import { getInitials } from '../ResourceAvatar/ResourceAvatar.utils';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import classes from './DiagnosticReportDisplay.module.css';

export interface DiagnosticReportDisplayProps {
  readonly value?: DiagnosticReport | Reference<DiagnosticReport>;
  readonly hideObservationNotes?: boolean;
  readonly hideSpecimenInfo?: boolean;
  readonly hideSubject?: boolean;
}

DiagnosticReportDisplay.defaultProps = {
  hideObservationNotes: false,
  hideSpecimenInfo: false,
  hideSubject: false,
} as DiagnosticReportDisplayProps;

/**
 * Renders a diagnostic report, reading it and the resources it references through the Medplum
 * client and linking with MedplumLink.
 * @param props - The report or a reference to it, and the display options.
 * @returns The report display, or null until the report is read.
 */
export function DiagnosticReportDisplay(props: DiagnosticReportDisplayProps): JSX.Element | null {
  const diagnosticReport = useResource(props.value);
  const resources = useDiagnosticReportResources(diagnosticReport);

  if (!diagnosticReport) {
    return null;
  }

  return (
    <DiagnosticReportDisplayView
      value={diagnosticReport}
      resources={resources}
      renderLink={renderMedplumLink}
      hideObservationNotes={props.hideObservationNotes}
      hideSpecimenInfo={props.hideSpecimenInfo}
      hideSubject={props.hideSubject}
    />
  );
}

/** Renders a link to a resource. A view given none renders its content without links. */
export type RenderResourceLink = (to: Reference | Resource, children: ReactNode) => ReactNode;

export interface DiagnosticReportDisplayViewProps {
  readonly value: DiagnosticReport;
  readonly hideObservationNotes?: boolean;
  readonly hideSpecimenInfo?: boolean;
  readonly hideSubject?: boolean;
  /**
   * The resources the report references, resolved by the caller: the result Observations and
   * their members, the Specimens, the first basedOn ServiceRequest and its requester, and the
   * performers of the report and of its observations. Contained resources resolve on their own.
   * An unresolved reference shows its display string; an unresolved Observation shows no row.
   */
  readonly resources?: Resource[];
  /** Renders the links to the subject, the performers, and the observations. Default: no links. */
  readonly renderLink?: RenderResourceLink;
}

type Resolve = <T extends Resource>(value: Reference<T> | T | undefined) => WithId<T> | undefined;

interface ViewContextValue {
  readonly resolve: Resolve;
  readonly renderLink: RenderResourceLink;
}

const renderPlain: RenderResourceLink = (_to, children) => children;

const ViewContext = createContext<ViewContextValue>({ resolve: () => undefined, renderLink: renderPlain });

function useViewContext(
  resources: Resource[] | undefined,
  contained: Resource[] | undefined,
  renderLink: RenderResourceLink | undefined
): ViewContextValue {
  return useMemo(() => {
    const byReference = new Map<string, Resource>();
    for (const resource of contained ?? []) {
      byReference.set(`#${resource.id}`, resource);
    }
    for (const resource of resources ?? []) {
      byReference.set(`${resource.resourceType}/${resource.id}`, resource);
    }
    const resolve: Resolve = <T extends Resource>(value: Reference<T> | T | undefined): WithId<T> | undefined => {
      if (!value) {
        return undefined;
      }
      if (isResource(value)) {
        return value as WithId<T>;
      }
      const key = value.reference;
      return key ? (byReference.get(key) as WithId<T> | undefined) : undefined;
    };
    return { resolve, renderLink: renderLink ?? renderPlain };
  }, [resources, contained, renderLink]);
}

/**
 * Renders a diagnostic report from the report and the resources it references. It holds no
 * client: the caller resolves the references and supplies any links.
 * @param props - The report, its resolved resources, and the display options.
 * @returns The report display.
 */
export function DiagnosticReportDisplayView(props: DiagnosticReportDisplayViewProps): JSX.Element {
  const { value, hideObservationNotes = false, hideSpecimenInfo = false, hideSubject = false } = props;
  const context = useViewContext(props.resources, value.contained, props.renderLink);
  const { resolve } = context;

  const specimens = useMemo(
    () => (value.specimen ?? []).map((ref) => resolve(ref)).filter((specimen): specimen is WithId<Specimen> => !!specimen),
    [value.specimen, resolve]
  );
  const performingLabs = useMemo(() => getPerformingLabs(value, resolve), [value, resolve]);

  const specimenNotes: Annotation[] = specimens.flatMap((spec) => spec.note || []);

  if (value.presentedForm && value.presentedForm.length > 0) {
    const pf = value.presentedForm[0];
    if (pf.contentType?.startsWith('text/plain') && pf.data) {
      specimenNotes.push({ text: window.atob(pf.data) });
    }
  }

  return (
    <ViewContext.Provider value={context}>
      <Stack>
        <Title>Diagnostic Report</Title>
        <DiagnosticReportHeader value={value} hideSubject={hideSubject} />
        {specimens.length > 0 && !hideSpecimenInfo && <SpecimenInfo specimens={specimens} />}
        {value.result && <ObservationTableMarkup hideObservationNotes={hideObservationNotes} value={value.result} />}
        {specimenNotes.length > 0 && <NoteDisplay value={specimenNotes} />}
        {value.conclusion && (
          <Stack mt="md">
            <Text fw={500} size="sm" c="dimmed">
              Conclusion
            </Text>
            <Text>{value.conclusion}</Text>
          </Stack>
        )}
        <PerformingLabs labs={performingLabs} />
      </Stack>
    </ViewContext.Provider>
  );
}

interface DiagnosticReportHeaderProps {
  readonly value: DiagnosticReport;
  readonly hideSubject: boolean;
}

function DiagnosticReportHeader({ value, hideSubject }: DiagnosticReportHeaderProps): JSX.Element {
  const { resolve } = useContext(ViewContext);
  const basedOn = resolve(value.basedOn?.[0]);
  const requester = basedOn?.resourceType === 'ServiceRequest' ? basedOn.requester : undefined;
  const showSubject = Boolean(value.subject && !hideSubject);
  const hasLeftColumn = showSubject || Boolean(requester) || Boolean(value.resultsInterpreter?.length);
  const hasRightColumn = Boolean(value.performer?.length || value.issued || value.status);
  return (
    <Group mt="md" gap="xl" align="stretch" wrap="nowrap">
      {hasLeftColumn && (
        <Stack gap="md" style={{ flex: 1 }}>
          {showSubject && value.subject && (
            <HeaderField label="Subject">
              <ResolvedBadge value={value.subject} />
            </HeaderField>
          )}
          {requester && (
            <HeaderField label="Ordering">
              <ResolvedBadge value={requester} />
            </HeaderField>
          )}
          {value.resultsInterpreter?.map((interpreter) => (
            <HeaderField key={interpreter.reference} label="Interpreter">
              <ResolvedBadge value={interpreter} />
            </HeaderField>
          ))}
        </Stack>
      )}
      {hasLeftColumn && hasRightColumn && <Divider orientation="vertical" />}
      {hasRightColumn && (
        <Stack gap="md" style={{ flex: 1 }}>
          {value.performer?.map((performer) => (
            <HeaderField key={performer.reference} label="Performer">
              <PerformerDisplay value={performer} />
            </HeaderField>
          ))}
          {value.issued && (
            <HeaderField label="Issued">
              <Text>{formatDateTime(value.issued)}</Text>
            </HeaderField>
          )}
          {value.status && (
            <HeaderField label="Status">
              <StatusBadge status={value.status} />
            </HeaderField>
          )}
        </Stack>
      )}
    </Group>
  );
}

interface HeaderFieldProps {
  readonly label: string;
  readonly children: ReactNode;
}

function HeaderField({ label, children }: HeaderFieldProps): JSX.Element {
  return (
    <Group gap="md" align="flex-start" wrap="nowrap">
      <Text c="dimmed" w={110} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div>{children}</div>
    </Group>
  );
}

interface ResolvedBadgeProps {
  readonly value: Reference | Resource;
}

// The avatar and name of a resolved resource, each linked. An unresolved reference shows an empty avatar.
function ResolvedBadge({ value }: ResolvedBadgeProps): JSX.Element {
  const { resolve, renderLink } = useContext(ViewContext);
  const resource = resolve(value);
  const text = resource ? getDisplayString(resource) : '';
  return (
    <Group gap="xs">
      {renderLink(
        value,
        <Avatar size={24} radius={12} src={resource && getImageSrc(resource)} alt={text}>
          {getInitials(text)}
        </Avatar>
      )}
      {resource && renderLink(value, text)}
    </Group>
  );
}

interface PerformerDisplayProps {
  readonly value: NonNullable<DiagnosticReport['performer']>[number];
}

function PerformerDisplay({ value }: PerformerDisplayProps): JSX.Element {
  const { resolve } = useContext(ViewContext);
  const performer = resolve(value);
  const address = performer?.resourceType === 'Organization' ? performer.address?.[0] : undefined;
  return (
    <>
      <ResolvedBadge value={value} />
      {address && (
        <Text size="sm" c="dimmed" mt={4} ml={34}>
          <AddressDisplay value={address} />
        </Text>
      )}
    </>
  );
}

interface SpecimenInfoProps {
  readonly specimens: Specimen[];
}

function SpecimenInfo({ specimens }: SpecimenInfoProps): JSX.Element {
  return (
    <Stack gap="xs">
      <Title order={2} size="h6">
        Specimens
      </Title>

      <List type="ordered">
        {specimens.map((specimen) => (
          <List.Item ml="sm" key={`specimen-${specimen.id}`}>
            <Group gap={20}>
              <Group gap={5}>
                <Text fw={500}>Collected:</Text> {formatDateTime(specimen.collection?.collectedDateTime)}
              </Group>
              <Group gap={5}>
                <Text fw={500}>Received:</Text> {formatDateTime(specimen.receivedTime)}
              </Group>
            </Group>
          </List.Item>
        ))}
      </List>
    </Stack>
  );
}

export interface ObservationTableProps {
  readonly value?: Observation[] | Reference<Observation>[];
  readonly ancestorIds?: string[];
  readonly hideObservationNotes?: boolean;
}

/**
 * Renders a table of observations, reading them and their members and performers through the
 * Medplum client and linking with MedplumLink.
 * @param props - The observations and the display options.
 * @returns The observation table.
 */
export function ObservationTable(props: ObservationTableProps): JSX.Element {
  const resources = useResolvedResources(props.value, resolveObservationResources);
  return <ObservationTableView {...props} resources={resources} renderLink={renderMedplumLink} />;
}

export interface ObservationTableViewProps {
  readonly value?: Observation[] | Reference<Observation>[];
  readonly ancestorIds?: string[];
  readonly hideObservationNotes?: boolean;
  /** The referenced Observations, their members, and their performers, resolved by the caller. */
  readonly resources?: Resource[];
  /** Renders the links to the observations and their performers. Default: no links. */
  readonly renderLink?: RenderResourceLink;
}

/**
 * Renders a table of observations from the observations and the resources they reference.
 * It holds no client: the caller resolves the references and supplies any links.
 * @param props - The observations, their resolved resources, and the display options.
 * @returns The observation table.
 */
export function ObservationTableView(props: ObservationTableViewProps): JSX.Element {
  const { resources, renderLink, ...rest } = props;
  const context = useViewContext(resources, undefined, renderLink);
  return (
    <ViewContext.Provider value={context}>
      <ObservationTableMarkup {...rest} />
    </ViewContext.Provider>
  );
}

interface ObservationTableMarkupProps {
  readonly value?: Observation[] | Reference<Observation>[];
  readonly ancestorIds?: string[];
  readonly hideObservationNotes?: boolean;
}

function ObservationTableMarkup(props: ObservationTableMarkupProps): JSX.Element {
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th>Test</th>
          <th>Value</th>
          <th>Reference Range</th>
          <th>Interpretation</th>
          <th>Category</th>
          <th>Performer</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <ObservationRowGroup
          value={props.value}
          ancestorIds={props.ancestorIds}
          hideObservationNotes={props.hideObservationNotes}
        />
      </tbody>
    </table>
  );
}

interface ObservationRowGroupProps {
  readonly value?: Observation[] | Reference<Observation>[];
  readonly ancestorIds?: string[];
  readonly hideObservationNotes?: boolean;
}

function ObservationRowGroup(props: ObservationRowGroupProps): JSX.Element {
  return (
    <>
      {props.value?.map((observation) => (
        <ObservationRow
          key={`obs-${isResource(observation) ? observation.id : observation.reference}`}
          value={observation}
          ancestorIds={props.ancestorIds}
          hideObservationNotes={props.hideObservationNotes}
        />
      ))}
    </>
  );
}

interface ObservationRowProps {
  readonly value: Observation | Reference<Observation>;
  readonly ancestorIds?: string[];
  readonly hideObservationNotes?: boolean;
}

function ObservationRow(props: ObservationRowProps): JSX.Element | null {
  const { resolve, renderLink } = useContext(ViewContext);
  const observation = resolve(props.value);

  if (!observation || props.ancestorIds?.includes(observation.id)) {
    return null;
  }

  if (isDoNotReportObservation(observation)) {
    return null;
  }

  const displayNotes = !props.hideObservationNotes && observation.note;

  const critical = isCritical(observation);

  const depth = props.ancestorIds?.length ?? 0;

  const memberRows = observation.hasMember && (
    <ObservationRowGroup
      value={observation.hasMember as Reference<Observation>[]}
      ancestorIds={props.ancestorIds ? [...props.ancestorIds, observation.id] : [observation.id]}
      hideObservationNotes={props.hideObservationNotes}
    />
  );

  if (isGroupingObservation(observation)) {
    return (
      <>
        <tr className={classes.groupHeaderRow}>
          <td colSpan={7} style={indentStyle(depth)}>
            <Group gap="sm">
              {renderLink(observation, <CodeableConceptDisplay value={observation.code} />)}
              {observation.effectiveDateTime && (
                <Text size="sm" c="dimmed" fw={400}>
                  Collected: {formatDateTime(observation.effectiveDateTime)}
                </Text>
              )}
            </Group>
          </td>
        </tr>
        {displayNotes && (
          <tr>
            <td colSpan={7} style={indentStyle(depth + 1)}>
              <NoteDisplay value={observation.note} />
            </td>
          </tr>
        )}
        {memberRows}
      </>
    );
  }

  return (
    <>
      <tr className={cx({ [classes.criticalRow]: critical })}>
        <td rowSpan={displayNotes ? 2 : 1} style={indentStyle(depth)}>
          {renderLink(observation, <CodeableConceptDisplay value={observation.code} />)}
        </td>
        <td>
          <ObservationValueDisplay value={observation} />
        </td>
        <td>
          <ReferenceRangeDisplay value={observation.referenceRange} />
        </td>
        <td>
          {observation.interpretation && observation.interpretation.length > 0 && (
            <CodeableConceptDisplay value={observation.interpretation[0]} />
          )}
        </td>
        <td>
          {observation.category && observation.category.length > 0 && (
            <>
              {observation.category.map((concept) => (
                <div key={`category-${formatCodeableConcept(concept)}`}>
                  <CodeableConceptDisplay value={concept} />
                </div>
              ))}
            </>
          )}
        </td>
        <td>
          {observation.performer?.map((performer) => (
            <ObservationPerformerDisplay key={performer.reference} value={performer} />
          ))}
        </td>
        <td>{observation.status && <StatusBadge status={observation.status} />}</td>
      </tr>
      {memberRows}
      {displayNotes && (
        <tr>
          <td colSpan={6}>
            <NoteDisplay value={observation.note} />
          </td>
        </tr>
      )}
    </>
  );
}

interface ObservationPerformerDisplayProps {
  readonly value: Reference<Practitioner | PractitionerRole | Organization | CareTeam | Patient | RelatedPerson>;
}

function ObservationPerformerDisplay(props: ObservationPerformerDisplayProps): JSX.Element {
  const { resolve, renderLink } = useContext(ViewContext);
  const performer = resolve(props.value);
  if (performer) {
    return <>{renderLink(props.value, getDisplayString(performer))}</>;
  }
  const displayString = props.value.display || props.value.reference || stringify(props.value);
  return <>{props.value.reference ? renderLink(props.value, displayString) : displayString}</>;
}

interface ObservationValueDisplayProps {
  readonly value?: Observation | ObservationComponent;
}

function ObservationValueDisplay(props: ObservationValueDisplayProps): JSX.Element | null {
  const obs = props.value;
  return <>{formatObservationValue(obs)}</>;
}

interface ReferenceRangeProps {
  readonly value?: ObservationReferenceRange[];
}

function ReferenceRangeDisplay(props: ReferenceRangeProps): JSX.Element | null {
  const range = props.value && props.value.length > 0 && props.value[0];
  if (!range) {
    return null;
  }
  if (range.text) {
    return <>{range.text}</>;
  }
  return <RangeDisplay value={range} />;
}

/**
 * Indents a table cell by nesting depth, so members read as belonging to the group above them.
 * @param depth - The nesting depth of the observation, where the report's own results are depth 0.
 * @returns Style props for the cell.
 */
function indentStyle(depth: number): { paddingInlineStart: string } | undefined {
  return depth > 0 ? { paddingInlineStart: `calc(4px + ${depth} * var(--mantine-spacing-md))` } : undefined;
}

/**
 * Sentinel value Quest Diagnostics uses for a sub-result that was intentionally not reported,
 * such as a skipped reflex microscopy panel. Stands for "Do Not Report".
 */
const DO_NOT_REPORT_VALUE = 'DNR';

/**
 * Returns true if the observation is a leaf result whose value is the "Do Not Report" sentinel.
 * DiagnosticReportDisplay always hides these rows, matching how such not-reported sub-results
 * are conventionally omitted from a printed lab report.
 *
 * Grouping observations (those with `hasMember`) are excluded: `formatObservationValue` already
 * returns an empty string for them (they carry members, not a value of their own), so this check
 * would not match a well-formed group - but excluding them explicitly means a group can never be
 * hidden by this check even if some future or malformed feed puts "DNR" on a group's own value,
 * which would otherwise hide every result nested under it.
 * @param observation - The FHIR observation.
 * @returns True if the observation is a non-grouping result reported as "DNR".
 */
function isDoNotReportObservation(observation: Observation): boolean {
  const isLeafResult = !observation.hasMember?.length;
  return isLeafResult && formatObservationValue(observation) === DO_NOT_REPORT_VALUE;
}

/**
 * Returns true if the observation exists only to group its members.
 *
 * Panel headers - such as Health Gorilla's `hg-observaton-group` - carry a code and members but no
 * result of their own, so a normal row for them renders with every data column blank. Labs consider
 * such a row misleading, so they are rendered as a section header spanning the table instead.
 * @param observation - The FHIR observation.
 * @returns True if the observation has members and nothing of its own to display.
 */
function isGroupingObservation(observation: Observation): boolean {
  if (!observation.hasMember?.length) {
    return false;
  }
  return !(
    formatObservationValue(observation) ||
    observation.dataAbsentReason ||
    observation.interpretation?.length ||
    observation.referenceRange?.length
  );
}

/**
 * Returns true if the observation is critical.
 * See: https://www.hl7.org/fhir/valueset-observation-interpretation.html
 * @param observation - The FHIR observation.
 * @returns True if the FHIR observation is a critical value.
 */
function isCritical(observation: Observation): boolean {
  const code = observation.interpretation?.[0]?.coding?.[0]?.code;
  if (code !== undefined) {
    return code === 'AA' || code === 'LL' || code === 'HH' || code === 'A';
  }
  const interpretation = observation.interpretation?.[0].text;
  return (
    interpretation === 'Critical abnormal' ||
    interpretation === 'Critical high' ||
    interpretation === 'Critical low' ||
    interpretation === 'Critical' ||
    interpretation === 'Abnormal'
  );
}

interface PerformingLabsProps {
  readonly labs: Organization[];
}

function PerformingLabs({ labs }: PerformingLabsProps): JSX.Element | null {
  if (labs.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs" mt="md">
      <Divider />
      <Text fw={500} size="sm" c="dimmed">
        Performing Labs
      </Text>
      {labs.map((lab) => (
        <Group key={`lab-${lab.id}-${lab.name}`} justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text>{lab.name}</Text>
            {lab.address?.[0] && (
              <Text size="sm" c="dimmed">
                <AddressDisplay value={lab.address[0]} />
              </Text>
            )}
          </div>
          <LabContactDisplay value={lab.contact?.[0]} />
        </Group>
      ))}
    </Stack>
  );
}

interface LabContactDisplayProps {
  readonly value?: OrganizationContact;
}

function LabContactDisplay({ value }: LabContactDisplayProps): JSX.Element | null {
  if (!value) {
    return null;
  }
  return (
    <div style={{ textAlign: 'right' }}>
      {value.name && <Text>{value.name.text ?? formatHumanName(value.name)}</Text>}
      {value.telecom?.[0] && (
        <Text size="sm" c="dimmed">
          <ContactPointDisplay value={value.telecom[0]} />
        </Text>
      )}
    </div>
  );
}

/**
 * Collects the unique performing lab organizations for a diagnostic report.
 *
 * Walks the report results (including nested observation groups) and takes each observation
 * performer that is an Organization. References of the form "#id" resolve against the report's
 * contained resources, which is how lab integrations such as Health Gorilla represent the
 * performing labs.
 * @param report - The diagnostic report.
 * @param resolve - Finds a referenced resource.
 * @returns The unique performing lab organizations.
 */
function getPerformingLabs(report: DiagnosticReport, resolve: Resolve): Organization[] {
  const observations: Observation[] = [];
  const visited = new Set<string>();

  const visit = (ref: Reference<Observation>): void => {
    const refString = ref.reference;
    if (!refString || visited.has(refString)) {
      return;
    }
    visited.add(refString);
    const observation = resolve(ref);
    if (!observation) {
      return;
    }
    observations.push(observation);
    for (const member of observation.hasMember ?? []) {
      visit(member as Reference<Observation>);
    }
  };

  for (const result of report.result ?? []) {
    visit(result);
  }

  const labs = new Map<string, Organization>();
  for (const performer of observations.flatMap((observation) => observation.performer ?? [])) {
    const refString = performer.reference;
    if (!refString?.startsWith('#') && !refString?.startsWith('Organization/')) {
      continue;
    }
    const organization = resolve(performer as Reference<Organization>);
    if (organization?.resourceType === 'Organization' && (organization.address || organization.contact)) {
      const key = `${organization.name}|${formatAddress(organization.address?.[0])}`;
      if (!labs.has(key)) {
        labs.set(key, organization);
      }
    }
  }

  return Array.from(labs.values());
}

/**
 * Links through MedplumLink, for the Medplum-backed wrappers of the client-free views.
 * @param to - The resource or reference to link to.
 * @param children - The link content.
 * @returns The link.
 */
export const renderMedplumLink: RenderResourceLink = (to, children) => <MedplumLink to={to}>{children}</MedplumLink>;

/**
 * Reads the resources a report references through the Medplum client, for DiagnosticReportDisplayView.
 * @param report - The report.
 * @returns The resolved resources, or undefined until they are read.
 */
export function useDiagnosticReportResources(report: DiagnosticReport | undefined): Resource[] | undefined {
  return useResolvedResources(report, resolveReportResources);
}

function useResolvedResources<T>(
  input: T | undefined,
  resolveFn: (medplum: MedplumClient, input: T) => Promise<Resource[]>
): Resource[] | undefined {
  const medplum = useMedplum();
  const [resources, setResources] = useState<Resource[]>();

  useEffect(() => {
    setResources(undefined);
    if (!input) {
      return undefined;
    }
    let subscribed = true;
    resolveFn(medplum, input)
      .then((resolved) => {
        if (subscribed) {
          setResources(resolved);
        }
      })
      .catch(console.error);
    return () => {
      subscribed = false;
    };
  }, [medplum, input, resolveFn]);

  return resources;
}

async function resolveReportResources(medplum: MedplumClient, report: DiagnosticReport): Promise<Resource[]> {
  const reader = createReader(medplum, report.contained);
  const basedOn = await reader.read(report.basedOn?.[0]);
  await Promise.all([
    reader.read(report.subject),
    reader.read(basedOn?.resourceType === 'ServiceRequest' ? basedOn.requester : undefined),
    ...(report.resultsInterpreter ?? []).map((ref) => reader.read(ref)),
    ...(report.performer ?? []).map((ref) => reader.read(ref)),
    ...(report.specimen ?? []).map((ref) => reader.read(ref)),
    reader.readObservations(report.result),
  ]);
  return reader.resources;
}

async function resolveObservationResources(
  medplum: MedplumClient,
  value: Observation[] | Reference<Observation>[]
): Promise<Resource[]> {
  const reader = createReader(medplum, undefined);
  await reader.readObservations(value);
  return reader.resources;
}

interface ResourceReader {
  readonly resources: Resource[];
  read<T extends Resource>(ref: Reference<T> | undefined): Promise<T | undefined>;
  readObservations(value: Observation[] | Reference<Observation>[] | undefined): Promise<void>;
}

/**
 * Reads referenced resources once each, collecting them for a view. Contained references
 * resolve against the given contained resources and are not collected; a failed read is skipped.
 * @param medplum - The Medplum client.
 * @param contained - The contained resources that "#id" references resolve against.
 * @returns The reader.
 */
function createReader(medplum: MedplumClient, contained: Resource[] | undefined): ResourceReader {
  const resources: Resource[] = [];
  const pending = new Map<string, Promise<Resource | undefined>>();
  const visited = new Set<string>();

  async function read<T extends Resource>(ref: Reference<T> | undefined): Promise<T | undefined> {
    const refString = ref?.reference;
    if (!refString) {
      return undefined;
    }
    if (refString.startsWith('#')) {
      return contained?.find((resource) => resource.id === refString.slice(1)) as T | undefined;
    }
    let promise = pending.get(refString);
    if (!promise) {
      promise = medplum.readReference(ref as Reference).then(
        (resource) => {
          resources.push(resource);
          return resource;
        },
        () => undefined
      );
      pending.set(refString, promise);
    }
    return (await promise) as T | undefined;
  }

  async function readObservations(value: Observation[] | Reference<Observation>[] | undefined): Promise<void> {
    await Promise.all(
      ((value ?? []) as (Observation | Reference<Observation>)[]).map(async (item) => {
        const key = isReference(item) ? item.reference : `Observation/${item.id}`;
        if (visited.has(key)) {
          return;
        }
        visited.add(key);
        const observation: Observation | undefined = isReference(item)
          ? await read<Observation>(item as Reference<Observation>)
          : (item as Observation);
        if (!observation) {
          return;
        }
        await Promise.all([
          ...(observation.performer ?? []).map((ref) => read(ref)),
          readObservations(observation.hasMember as Reference<Observation>[] | undefined),
        ]);
      })
    );
  }

  return { resources, read, readObservations };
}
