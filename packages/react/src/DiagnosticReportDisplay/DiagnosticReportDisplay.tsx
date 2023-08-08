import { createStyles, Group, List, Stack, Text, Title } from '@mantine/core';
import { capitalize, formatCodeableConcept, formatDateTime, formatObservationValue, isReference } from '@medplum/core';
import {
  Annotation,
  DiagnosticReport,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Reference,
  Specimen,
} from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { NoteDisplay } from '../NoteDisplay/NoteDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';
import { ReferenceDisplay } from '../ReferenceDisplay/ReferenceDisplay';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import { useResource } from '../useResource/useResource';

const useStyles = createStyles((theme) => ({
  table: {
    border: `0.1px solid ${theme.colors.gray[5]}`,
    borderCollapse: 'collapse',

    '& td, & th': {
      border: `0.1px solid ${theme.colors.gray[5]}`,
      padding: 4,
    },
  },

  criticalRow: {
    background: theme.colorScheme === 'dark' ? theme.colors.red[7] : theme.colors.red[1],
    border: `0.1px solid ${theme.colors.red[5]}`,
    color: theme.colors.red[5],
    fontWeight: 500,

    '& td': {
      border: `0.1px solid ${theme.colors.red[5]}`,
    },
  },

  noteBody: { fontSize: theme.fontSizes.sm },
  noteCite: { fontSize: theme.fontSizes.xs, marginBlockStart: 3 },
  noteRoot: { padding: 5 },
}));

export interface DiagnosticReportDisplayProps {
  value?: DiagnosticReport | Reference<DiagnosticReport>;
  hideObservationNotes?: boolean;
  hideSpecimenInfo?: boolean;
}

DiagnosticReportDisplay.defaultProps = {
  hideObservationNotes: false,
  hideSpecimenInfo: false,
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
      <DiagnosticReportHeader value={diagnosticReport} />
      {!props.hideSpecimenInfo && SpecimenInfo(specimens)}
      {diagnosticReport.result && (
        <ObservationTable hideObservationNotes={props.hideObservationNotes} value={diagnosticReport.result} />
      )}
      {specimenNotes.length > 0 && <NoteDisplay value={specimenNotes} />}
    </Stack>
  );
}

interface DiagnosticReportHeaderProps {
  value: DiagnosticReport;
}

function DiagnosticReportHeader({ value }: DiagnosticReportHeaderProps): JSX.Element {
  return (
    <Group mt="md" spacing={30}>
      {value.subject && (
        <div>
          <Text size="xs" transform="uppercase" color="dimmed">
            Subject
          </Text>
          <Text>
            <ResourceBadge value={value.subject} link={true} />
          </Text>
        </div>
      )}
      {value.resultsInterpreter?.map((interpreter) => (
        <div key={interpreter.reference}>
          <Text size="xs" transform="uppercase" color="dimmed">
            Interpreter
          </Text>
          <Text>
            <ResourceBadge value={interpreter} link={true} />
          </Text>
        </div>
      ))}
      {value.performer?.map((performer) => (
        <div key={performer.reference}>
          <Text size="xs" transform="uppercase" color="dimmed">
            Performer
          </Text>
          <Text>
            <ResourceBadge value={performer} link={true} />
          </Text>
        </div>
      ))}
      {value.issued && (
        <div>
          <Text size="xs" transform="uppercase" color="dimmed">
            Issued
          </Text>
          <Text>{formatDateTime(value.issued)}</Text>
        </div>
      )}
      {value.status && (
        <div>
          <Text size="xs" transform="uppercase" color="dimmed">
            Status
          </Text>
          <Text>{capitalize(value.status)}</Text>
        </div>
      )}
    </Group>
  );
}

function SpecimenInfo(specimens: Specimen[] | undefined): JSX.Element {
  return (
    <Stack spacing={'xs'}>
      <Title order={2} size="h6">
        Specimens
      </Title>

      <List type="ordered">
        {specimens?.map((specimen) => (
          <List.Item ml={'sm'} key={`specimen-${specimen.id}`}>
            <Group spacing={20}>
              <Group spacing={5}>
                <Text fw={500}>Collected:</Text> {formatDateTime(specimen.collection?.collectedDateTime)}
              </Group>
              <Group spacing={5}>
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
  value?: Observation[] | Reference<Observation>[];
  hideObservationNotes?: boolean;
}

export function ObservationTable(props: ObservationTableProps): JSX.Element {
  const { classes } = useStyles();
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
        {props.value?.map((observation) => (
          <ObservationRow
            key={`obs-${isReference(observation) ? observation.reference : observation.id}`}
            hideObservationNotes={props.hideObservationNotes}
            value={observation}
          />
        ))}
      </tbody>
    </table>
  );
}

interface ObservationRowProps {
  value: Observation | Reference<Observation>;
  hideObservationNotes?: boolean;
}

function ObservationRow(props: ObservationRowProps): JSX.Element | null {
  const { classes, cx } = useStyles();
  const observation = useResource(props.value);

  if (!observation) {
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
            <ul>
              {observation.category.map((concept) => (
                <li key={`category-${formatCodeableConcept(concept)}`}>
                  <CodeableConceptDisplay value={concept} />
                </li>
              ))}
            </ul>
          )}
        </td>
        <td>
          {observation.performer?.map((performer) => (
            <ReferenceDisplay key={performer.reference} value={performer} />
          ))}
        </td>
        <td>{observation.status && <StatusBadge status={observation.status} />}</td>
      </tr>
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
  value?: Observation | ObservationComponent;
}

function ObservationValueDisplay(props: ObservationValueDisplayProps): JSX.Element | null {
  const obs = props.value;
  return <>{formatObservationValue(obs)}</>;
}

interface ReferenceRangeProps {
  value?: ObservationReferenceRange[];
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
 * @param observation The FHIR observation.
 * @returns True if the FHIR observation is a critical value.
 */
function isCritical(observation: Observation): boolean {
  const code = observation.interpretation?.[0]?.coding?.[0]?.code;
  return code === 'AA' || code === 'LL' || code === 'HH' || code === 'A';
}
