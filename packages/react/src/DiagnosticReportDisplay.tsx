import { capitalize, formatDateTime } from '@medplum/core';
import {
  DiagnosticReport,
  Observation,
  ObservationComponent,
  ObservationReferenceRange,
  Reference,
} from '@medplum/fhirtypes';
import React from 'react';
import { CodeableConceptDisplay } from './CodeableConceptDisplay';
import './DiagnosticReportDisplay.css';
import { MedplumLink } from './MedplumLink';
import { QuantityDisplay } from './QuantityDisplay';
import { RangeDisplay } from './RangeDisplay';
import { ResourceBadge } from './ResourceBadge';
import './Table.css';
import { useResource } from './useResource';

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
    <div className="medplum-diagnostic-report">
      <h1>Diagnostic Report</h1>
      <div className="medplum-diagnostic-report-header">
        {diagnosticReport.subject && (
          <dl>
            <dt>Subject</dt>
            <dd>
              <ResourceBadge value={diagnosticReport.subject} link={true} />
            </dd>
          </dl>
        )}
        {diagnosticReport.resultsInterpreter &&
          diagnosticReport.resultsInterpreter.map((interpreter) => (
            <dl key={interpreter.reference}>
              <dt>Interpreter</dt>
              <dd>
                <ResourceBadge value={interpreter} link={true} />
              </dd>
            </dl>
          ))}
        {diagnosticReport.issued && (
          <dl>
            <dt>Issued</dt>
            <dd>{formatDateTime(diagnosticReport.issued)}</dd>
          </dl>
        )}
        {diagnosticReport.status && (
          <dl>
            <dt>Status</dt>
            <dd>{capitalize(diagnosticReport.status)}</dd>
          </dl>
        )}
      </div>
      {diagnosticReport.result && <ObservationTable value={diagnosticReport.result} />}
      {textContent && <pre>{textContent.trim()}</pre>}
    </div>
  );
}

export interface ObservationTableProps {
  value?: Observation[] | Reference<Observation>[];
}

export function ObservationTable(props: ObservationTableProps): JSX.Element {
  return (
    <table className="medplum-table">
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
  const observation = useResource(props.value);
  if (!observation) {
    return null;
  }

  let className = undefined;
  if (isCritical(observation)) {
    className = 'medplum-critical';
  }

  return (
    <tr className={className}>
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

  if (obs?.valueQuantity) {
    return <QuantityDisplay value={props.value?.valueQuantity} />;
  }

  if (obs?.valueString) {
    return <>{obs.valueString}</>;
  }

  if (obs && 'component' in obs && obs?.component) {
    return (
      <>
        {obs.component
          .map<React.ReactNode>((component: ObservationComponent, index: number) => (
            <ObservationValueDisplay key={`obs-${index}`} value={component} />
          ))
          .reduce((prev, curr) => [prev, ' / ', curr])}
      </>
    );
  }

  return null;
}

interface ReferenceRangeProps {
  value?: ObservationReferenceRange[];
}

function ReferenceRangeDisplay(props: ReferenceRangeProps): JSX.Element | null {
  const range = props.value && props.value.length > 0 && props.value[0];
  if (!range) {
    return null;
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
  return code === 'AA' || code === 'LL' || code === 'HH';
}
