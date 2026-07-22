// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Group, List, Stack, Text, Title } from '@mantine/core';
import { formatCodeableConcept, formatDateTime, formatObservationValue, isReference } from '@medplum/core';
import type {
  Annotation,
  DiagnosticReport,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Reference,
  Specimen,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AddressDisplay } from '../AddressDisplay/AddressDisplay';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { NoteDisplay } from '../NoteDisplay/NoteDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';
import { ReferenceDisplay } from '../ReferenceDisplay/ReferenceDisplay';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';
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

export function DiagnosticReportDisplay(props: DiagnosticReportDisplayProps): JSX.Element | null {
  const medplum = useMedplum();
  const diagnosticReport = useResource(props.value);
  const [specimens, setSpecimens] = useState<Specimen[]>();

  useEffect(() => {
    if (diagnosticReport?.specimen) {
      Promise.allSettled(diagnosticReport.specimen.map((ref) => medplum.readReference(ref)))
        .then((outcomes) =>
          outcomes
            .filter((outcome) => outcome.status === 'fulfilled')
            .map((outcome) => (outcome as PromiseFulfilledResult<Specimen>).value)
        )
        .then(setSpecimens)
        .catch(console.error);
    }
  }, [medplum, diagnosticReport]);

  if (!diagnosticReport) {
    return null;
  }

  const specimenNotes: Annotation[] = specimens?.flatMap((spec) => spec.note || []) || [];

  if (diagnosticReport.presentedForm && diagnosticReport.presentedForm.length > 0) {
    const pf = diagnosticReport.presentedForm[0];
    if (pf.contentType?.startsWith('text/plain') && pf.data) {
      specimenNotes.push({ text: window.atob(pf.data) });
    }
  }

  return (
    <Stack>
      <Title>Diagnostic Report</Title>
      <DiagnosticReportHeader value={diagnosticReport} hideSubject={props.hideSubject} />
      {specimens && !props.hideSpecimenInfo && SpecimenInfo(specimens)}
      {diagnosticReport.result && (
        <ObservationTable hideObservationNotes={props.hideObservationNotes} value={diagnosticReport.result} />
      )}
      {specimenNotes.length > 0 && <NoteDisplay value={specimenNotes} />}
      {diagnosticReport.conclusion && (
        <Stack mt="md">
          <Text fw={500} size="sm" c="dimmed">
            Conclusion
          </Text>
          <Text>{diagnosticReport.conclusion}</Text>
        </Stack>
      )}
    </Stack>
  );
}

interface DiagnosticReportHeaderProps {
  readonly value: DiagnosticReport;
  readonly hideSubject?: boolean;
}

function DiagnosticReportHeader({ value, hideSubject = false }: DiagnosticReportHeaderProps): JSX.Element {
  const showSubject = Boolean(value.subject && !hideSubject);
  const hasLeftColumn = showSubject || Boolean(value.resultsInterpreter?.length);
  const hasRightColumn = Boolean(value.performer?.length || value.issued || value.status);
  return (
    <Group mt="md" gap="xl" align="stretch" wrap="nowrap">
      {hasLeftColumn && (
        <Stack gap="md" style={{ flex: 1 }}>
          {showSubject && (
            <HeaderField label="Subject">
              <ResourceBadge value={value.subject} link={true} />
            </HeaderField>
          )}
          {value.resultsInterpreter?.map((interpreter) => (
            <HeaderField key={interpreter.reference} label="Interpreter">
              <ResourceBadge value={interpreter} link={true} />
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

interface PerformerDisplayProps {
  readonly value: NonNullable<DiagnosticReport['performer']>[number];
}

function PerformerDisplay({ value }: PerformerDisplayProps): JSX.Element {
  const performer = useResource(value);
  const address = performer?.resourceType === 'Organization' ? performer.address?.[0] : undefined;
  return (
    <>
      <ResourceBadge value={value} link={true} />
      {address && (
        <Text size="sm" c="dimmed" mt={4} ml={34}>
          <AddressDisplay value={address} />
        </Text>
      )}
    </>
  );
}

function SpecimenInfo(specimens: Specimen[] | undefined): JSX.Element {
  return (
    <Stack gap="xs">
      <Title order={2} size="h6">
        Specimens
      </Title>

      <List type="ordered">
        {specimens?.map((specimen) => (
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

export function ObservationTable(props: ObservationTableProps): JSX.Element {
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
          key={`obs-${isReference(observation) ? observation.reference : observation.id}`}
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
  const observation = useResource(props.value);

  if (!observation || props.ancestorIds?.includes(observation.id)) {
    return null;
  }

  const displayNotes = !props.hideObservationNotes && observation.note;

  const critical = isCritical(observation);

  return (
    <>
      <tr className={cx({ [classes.criticalRow]: critical })}>
        <td rowSpan={displayNotes ? 2 : 1}>
          <MedplumLink to={observation}>
            <CodeableConceptDisplay value={observation.code} />
          </MedplumLink>
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
            <ReferenceDisplay key={performer.reference} value={performer} />
          ))}
        </td>
        <td>{observation.status && <StatusBadge status={observation.status} />}</td>
      </tr>
      {observation.hasMember && (
        <ObservationRowGroup
          value={observation.hasMember as Reference<Observation>[]}
          ancestorIds={props.ancestorIds ? [...props.ancestorIds, observation.id] : [observation.id]}
          hideObservationNotes={props.hideObservationNotes}
        />
      )}
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
 * Returns true if the observation is critical.
 * See: https://www.hl7.org/fhir/valueset-observation-interpretation.html
 * @param observation - The FHIR observation.
 * @returns True if the FHIR observation is a critical value.
 */
function isCritical(observation: Observation): boolean {
  const code = observation.interpretation?.[0]?.coding?.[0]?.code;
  return code === 'AA' || code === 'LL' || code === 'HH' || code === 'A';
}
