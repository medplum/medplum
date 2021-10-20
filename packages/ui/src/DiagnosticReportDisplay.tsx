import { DiagnosticReport, Observation, ObservationComponent, ObservationReferenceRange, Reference } from '@medplum/core';
import React from 'react';
import { CodeableConceptDisplay } from './CodeableConceptDisplay';
import { MedplumLink } from './MedplumLink';
import { useResource } from './useResource';
import './DiagnosticReportDisplay.css';

export interface DiagnosticReportDisplayProps {
  value?: DiagnosticReport | Reference<DiagnosticReport>;
}

export function DiagnosticReportDisplay(props: DiagnosticReportDisplayProps) {
  const diagnosticReport = useResource(props.value);
  if (!diagnosticReport) {
    return null;
  }

  return (
    <div className="medplum-diagnostic-report">
      <h1>Diagnostic Report</h1>
      <ObservationTable value={diagnosticReport.result as Reference<Observation>[]} />
    </div>
  );
}

export interface ObservationTableProps {
  value?: Observation[] | Reference<Observation>[];
}

export function ObservationTable(props: ObservationTableProps): JSX.Element {
  return (
    <table className="medplum-observation-table">
      <thead>
        <tr>
          <th>Test</th>
          <th>Units</th>
          <th>Value</th>
          <th>Reference Range</th>
          <th>Interpretation</th>
        </tr>
      </thead>
      <tbody>
        {props.value?.map((observation, index) => (
          <ObservationRow
            key={'obs-' + index}
            value={observation}
          />
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

  return (
    <tr>
      <td>
        <MedplumLink to={observation}>
          <CodeableConceptDisplay value={observation.code} />
        </MedplumLink>
      </td>
      <td>{getUnitsDisplayString(observation)}</td>
      <td>{getValueDisplayString(observation)}</td>
      <td><ReferenceRangeDisplay value={observation.referenceRange} /></td>
      <td>
        {observation.interpretation && observation.interpretation.length > 0 && (
          <CodeableConceptDisplay value={observation.interpretation[0]} />
        )}
      </td>
    </tr>
  );
}

function getUnitsDisplayString(observation: Observation | ObservationComponent): string | undefined {
  if (observation.valueQuantity?.unit) {
    return observation.valueQuantity.unit;
  }

  if ('component' in observation && observation.component) {
    return observation.component.map(c => getUnitsDisplayString(c)).join('/');
  }

  return undefined;
}

function getValueDisplayString(observation: Observation | ObservationComponent): string | number | undefined {
  if (observation.valueQuantity?.value) {
    return observation.valueQuantity.value;
  }

  if (observation.valueString) {
    return observation.valueString;
  }

  if ('component' in observation && observation.component) {
    return observation.component.map(c => getValueDisplayString(c)).join('/');
  }

  return undefined;
}

interface ReferenceRangeProps {
  value?: ObservationReferenceRange[];
}

function ReferenceRangeDisplay(props: ReferenceRangeProps): JSX.Element | null {
  const range = props.value && props.value.length > 0 && props.value[0];
  if (!range) {
    return null;
  }

  const { low, high } = range;

  if (low && high) {
    return (
      <>{low.value}&nbsp;-&nbsp;{high.value}</>
    );
  }

  if (low) {
    return (
      <>&gt;{low.value}</>
    );
  }

  if (high) {
    return (
      <>&lt;{high.value}</>
    );
  }

  return null;
}
