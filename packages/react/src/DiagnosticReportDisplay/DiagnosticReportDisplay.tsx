import { createStyles, Group, Stack, Text, Title } from '@mantine/core';
import { capitalize, formatDateTime, formatObservationValue } from '@medplum/core';
import {
  Annotation,
  DiagnosticReport,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Reference,
} from '@medplum/fhirtypes';
import React from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { NoteDisplay } from '../NoteDisplay/NoteDisplay';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';
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
}

export function DiagnosticReportDisplay(props: DiagnosticReportDisplayProps): JSX.Element | null {
  const diagnosticReport = useResource(props.value);
  const specimen = useResource(diagnosticReport?.specimen?.[0]);

  if (!diagnosticReport) {
    return null;
  }

  const specimenNotes: Annotation[] = specimen?.note || [];

  if (diagnosticReport.presentedForm && diagnosticReport.presentedForm.length > 0) {
    const pf = diagnosticReport.presentedForm[0];
    if (pf.contentType?.startsWith('text/plain') && pf.data) {
      specimenNotes.push({ text: window.atob(pf.data) });
    }
  }

  return (
    <Stack>
      <Title>Diagnostic Report</Title>
      <Group mt="md" spacing={30}>
        {diagnosticReport.subject && (
          <div>
            <Text size="xs" transform="uppercase" color="dimmed">
              Subject
            </Text>
            <Text>
              <ResourceBadge value={diagnosticReport.subject} link={true} />
            </Text>
          </div>
        )}
        {diagnosticReport.resultsInterpreter &&
          diagnosticReport.resultsInterpreter.map((interpreter) => (
            <div key={interpreter.reference}>
              <Text size="xs" transform="uppercase" color="dimmed">
                Interpreter
              </Text>
              <Text>
                <ResourceBadge value={interpreter} link={true} />
              </Text>
            </div>
          ))}
        {diagnosticReport.issued && (
          <div>
            <Text size="xs" transform="uppercase" color="dimmed">
              Issued
            </Text>
            <Text>{formatDateTime(diagnosticReport.issued)}</Text>
          </div>
        )}
        {diagnosticReport.status && (
          <div>
            <Text size="xs" transform="uppercase" color="dimmed">
              Status
            </Text>
            <Text>{capitalize(diagnosticReport.status)}</Text>
          </div>
        )}
      </Group>
      {diagnosticReport.result && (
        <ObservationTable hideObservationNotes={props.hideObservationNotes} value={diagnosticReport.result} />
      )}
      {specimenNotes.length > 0 && <NoteDisplay value={specimenNotes} />}
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
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {props.value?.map((observation, index) => (
          <ObservationRow
            key={`obs-${index}-${observation.id}`}
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
  const displayNotes = !props.hideObservationNotes && observation?.note;

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
              {observation.category.map((concept, index) => (
                <li key={`category-${index}`}>
                  <CodeableConceptDisplay value={concept} />
                </li>
              ))}
            </ul>
          )}
        </td>
        <td>{observation.status && <StatusBadge status={observation.status} />}</td>
      </tr>
      {displayNotes && (
        <tr>
          <td colSpan={5}>
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
