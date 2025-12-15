// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatDate, formatObservationValue, getReferenceString } from '@medplum/core';
import type { Observation, ObservationComponent, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { ChartData, ChartDataset } from 'chart.js';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { JSX } from 'react';

const lineChartOptions = {
  responsive: true,
  scales: {
    y: {
      beginAtZero: false,
    },
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
  },
};

const AsyncLine = lazy(async () => {
  const { CategoryScale, Chart, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } =
    await import('chart.js');
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
  const { Line } = await import('react-chartjs-2');
  return { default: Line };
});

export interface ObservationChartProps {
  /** The Observation resource to chart. The component will search for all Observations with the same code and patient. */
  readonly observation: Observation;
  /** Optional patient reference. If not provided, will be extracted from observation.subject. */
  readonly patient?: Patient | Reference<Patient>;
  /** Optional title for the chart. If not provided, will use the observation code display. */
  readonly title?: string;
  /** Optional height for the chart container. */
  readonly height?: number;
}

/**
 * ObservationChart component displays a line chart of Observation values over time.
 * 
 * This component searches for all Observations with the same code and patient as the provided observation,
 * then plots their values over time. It supports both simple Observations with valueQuantity and
 * multi-component Observations (e.g., blood pressure with systolic and diastolic components).
 * 
 * @example
 * ```tsx
 * <ObservationChart observation={observation} />
 * ```
 */
export function ObservationChart(props: ObservationChartProps): JSX.Element | null {
  const { observation, patient, title, height } = props;
  const medplum = useMedplum();
  const [chartData, setChartData] = useState<ChartData<'line', number[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function loadChartData(): Promise<void> {
      try {
        setLoading(true);
        setError(undefined);

        // Get patient reference
        const patientRef = patient || observation.subject;
        if (!patientRef) {
          setError('No patient reference found');
          setLoading(false);
          return;
        }

        // Extract code from observation
        const codeCoding = observation.code?.coding?.[0];
        if (!codeCoding?.code) {
          setError('Observation code not found');
          setLoading(false);
          return;
        }

        // Build search query
        // Format: system|code or just code
        const codeValue = codeCoding.system
          ? `${codeCoding.system}|${codeCoding.code}`
          : codeCoding.code;

        // Get patient reference string
        const patientRefString =
          typeof patientRef === 'string'
            ? patientRef
            : 'reference' in patientRef && patientRef.reference
            ? patientRef.reference
            : getReferenceString(patientRef as Patient);
        
        // Search for all observations with the same code and patient
        const observations = await medplum.searchResources('Observation', {
          patient: patientRefString,
          code: codeValue,
          _sort: 'date',
          _count: 1000, // Get up to 1000 observations
        });

        if (cancelled) {
          return;
        }

        if (observations.length === 0) {
          setError('No observations found');
          setLoading(false);
          return;
        }

        // Process observations into chart data
        const labels: string[] = [];
        const datasets: ChartDataset<'line', number[]>[] = [];

        // Check if this is a multi-component observation (e.g., blood pressure)
        const hasComponents = observations.some((obs) => obs.component && obs.component.length > 0);

        if (hasComponents) {
          // Multi-component observation
          // Group components by their code
          const componentMap = new Map<string, { label: string; unit: string; data: number[] }>();

          for (const obs of observations) {
            if (!obs.effectiveDateTime) {
              continue;
            }

            const dateLabel = formatDate(obs.effectiveDateTime);
            if (!labels.includes(dateLabel)) {
              labels.push(dateLabel);
            }

            if (obs.component) {
              for (const component of obs.component) {
                const componentCode = component.code?.coding?.[0]?.code;
                if (!componentCode) {
                  continue;
                }

                const componentDisplay = component.code?.coding?.[0]?.display || component.code?.text || componentCode;
                const componentUnit = component.valueQuantity?.unit || '';

                if (!componentMap.has(componentCode)) {
                  componentMap.set(componentCode, {
                    label: componentDisplay,
                    unit: componentUnit,
                    data: [],
                  });
                }

                const componentData = componentMap.get(componentCode)!;
                // Fill in missing values with NaN for proper alignment
                while (componentData.data.length < labels.length - 1) {
                  componentData.data.push(NaN);
                }
                componentData.data.push(component.valueQuantity?.value ?? NaN);
              }
            }
          }

          // Create datasets from component map
          let colorIndex = 0;
          const colors = [
            { backgroundColor: 'rgba(29, 112, 214, 0.7)', borderColor: 'rgba(29, 112, 214, 1)' },
            { backgroundColor: 'rgba(255, 119, 0, 0.7)', borderColor: 'rgba(255, 119, 0, 1)' },
            { backgroundColor: 'rgba(46, 204, 113, 0.7)', borderColor: 'rgba(46, 204, 113, 1)' },
            { backgroundColor: 'rgba(231, 76, 60, 0.7)', borderColor: 'rgba(231, 76, 60, 1)' },
            { backgroundColor: 'rgba(155, 89, 182, 0.7)', borderColor: 'rgba(155, 89, 182, 1)' },
          ];

          for (const [code, componentInfo] of componentMap.entries()) {
            const color = colors[colorIndex % colors.length];
            datasets.push({
              label: componentInfo.unit ? `${componentInfo.label} (${componentInfo.unit})` : componentInfo.label,
              data: componentInfo.data,
              backgroundColor: color.backgroundColor,
              borderColor: color.borderColor,
            });
            colorIndex++;
          }
        } else {
          // Simple observation with valueQuantity
          const unit = observations[0]?.valueQuantity?.unit || '';
          const display = observation.code?.coding?.[0]?.display || observation.code?.text || 'Value';

          const data: number[] = [];
          for (const obs of observations) {
            if (!obs.effectiveDateTime) {
              continue;
            }

            labels.push(formatDate(obs.effectiveDateTime));
            data.push(obs.valueQuantity?.value ?? NaN);
          }

          datasets.push({
            label: unit ? `${display} (${unit})` : display,
            data,
            backgroundColor: 'rgba(29, 112, 214, 0.7)',
            borderColor: 'rgba(29, 112, 214, 1)',
          });
        }

        if (cancelled) {
          return;
        }

        setChartData({ labels, datasets });
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
        setLoading(false);
      }
    }

    loadChartData();

    return () => {
      cancelled = true;
    };
  }, [medplum, observation, patient]);

  const chartTitle = title || observation.code?.coding?.[0]?.display || observation.code?.text || 'Observation Chart';

  if (loading) {
    return <div>Loading chart...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!chartData || chartData.labels.length === 0) {
    return <div>No data available to display</div>;
  }

  return (
    <div style={{ height: height ? `${height}px` : '400px', marginTop: '1rem' }}>
      <Suspense fallback={<div>Loading chart...</div>}>
        <AsyncLine options={lineChartOptions} data={chartData} />
      </Suspense>
    </div>
  );
}

