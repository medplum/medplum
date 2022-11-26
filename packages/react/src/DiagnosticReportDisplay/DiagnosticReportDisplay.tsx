import { createStyles, Group, Stack, Text, Title } from '@mantine/core';
import { capitalize, formatDateTime, formatObservationValue } from '@medplum/core';
import {
  DiagnosticReport,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Reference,
} from '@medplum/fhirtypes';
import React from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { RangeDisplay } from '../RangeDisplay/RangeDisplay';
import { ResourceBadge } from '../ResourceBadge/ResourceBadge';
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
}));

export interface DiagnosticReportDisplayProps {
  value?: DiagnosticReport | Reference<DiagnosticReport>;
}

export function DiagnosticReportDisplay(props: DiagnosticReportDisplayProps): JSX.Element | null {
  const diagnosticReport = useResource(props.value);
  const specimen = useResource(diagnosticReport?.specimen?.[0]);
  if (!diagnosticReport) {
    return null;
  }

  let textContent = '';

  if (diagnosticReport.presentedForm && diagnosticReport.presentedForm.length > 0) {
    const pf = diagnosticReport.presentedForm[0];
    if (pf.contentType?.startsWith('text/plain') && pf.data) {
      textContent = window.atob(pf.data);
    }
  }

  if (specimen?.note) {
    for (const note of specimen.note) {
      textContent += note.text + '\n\n';
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
      {diagnosticReport.result && <ObservationTable value={diagnosticReport.result} />}
      {textContent && <pre>{textContent.trim()}</pre>}
    </Stack>
  );
}

export interface ObservationTableProps {
  value?: Observation[] | Reference<Observation>[];
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
        </tr>
      </thead>
      <tbody>
        {props.value?.map((observation, index) => (
          <ObservationRow key={'obs-' + index} value={observation} />
        ))}
      </tbody>
    </table>
  );
}

interface ObservationRowProps {
  value: Observation | Reference<Observation>;
}

function ObservationRow(props: ObservationRowProps): JSX.Element | null {
  const { classes, cx } = useStyles();
  const observation = useResource(props.value);
  if (!observation) {
    return null;
  }

  const critical = isCritical(observation);

  return (
    <tr className={cx({ [classes.criticalRow]: critical })}>
      <td>
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
    </tr>
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
