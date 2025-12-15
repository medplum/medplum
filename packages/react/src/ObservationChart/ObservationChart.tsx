// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatDate, getReferenceString } from '@medplum/core';
import type { Observation, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { ComponentType, JSX } from 'react';

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

interface ChartDataPoint {
  date: string;
  [key: string]: string | number | undefined;
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
  const { observation, patient, title, height = 400 } = props;
  const medplum = useMedplum();
  const [chartData, setChartData] = useState<ChartDataPoint[]>();
  const [dataKeys, setDataKeys] = useState<string[]>([]);
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
        const dataMap = new Map<string, ChartDataPoint>();
        const keys = new Set<string>();

        // Check if this is a multi-component observation (e.g., blood pressure)
        const hasComponents = observations.some((obs) => obs.component && obs.component.length > 0);

        if (hasComponents) {
          // Multi-component observation
          for (const obs of observations) {
            if (!obs.effectiveDateTime) {
              continue;
            }

            const dateLabel = formatDate(obs.effectiveDateTime);
            let dataPoint = dataMap.get(dateLabel);
            if (!dataPoint) {
              dataPoint = { date: dateLabel };
              dataMap.set(dateLabel, dataPoint);
            }

            if (obs.component) {
              for (const component of obs.component) {
                const componentCode = component.code?.coding?.[0]?.code;
                if (!componentCode) {
                  continue;
                }

                const componentDisplay = component.code?.coding?.[0]?.display || component.code?.text || componentCode;
                const componentUnit = component.valueQuantity?.unit || '';
                const key = componentUnit ? `${componentDisplay} (${componentUnit})` : componentDisplay;
                
                keys.add(key);
                dataPoint[key] = component.valueQuantity?.value ?? null;
              }
            }
          }
        } else {
          // Simple observation with valueQuantity
          const unit = observations[0]?.valueQuantity?.unit || '';
          const display = observation.code?.coding?.[0]?.display || observation.code?.text || 'Value';
          const key = unit ? `${display} (${unit})` : display;
          
          keys.add(key);

          for (const obs of observations) {
            if (!obs.effectiveDateTime) {
              continue;
            }

            const dateLabel = formatDate(obs.effectiveDateTime);
            const dataPoint: ChartDataPoint = {
              date: dateLabel,
              [key]: obs.valueQuantity?.value ?? null,
            };
            dataMap.set(dateLabel, dataPoint);
          }
        }

        if (cancelled) {
          return;
        }

        // Convert map to array and sort by date
        const sortedData = Array.from(dataMap.values()).sort((a, b) => {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        setChartData(sortedData);
        setDataKeys(Array.from(keys));
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

  if (!chartData || chartData.length === 0) {
    return <div>No data available to display</div>;
  }

  // Dynamically import Mantine charts to avoid bundling if not used
  const [ChartComponents, setChartComponents] = useState<{
    LineChart: ComponentType<any>;
    CartesianGrid: ComponentType<any>;
    XAxis: ComponentType<any>;
    YAxis: ComponentType<any>;
    Tooltip: ComponentType<any>;
    Legend: ComponentType<any>;
    Line: ComponentType<any>;
  } | null>(null);

  useEffect(() => {
    import('@mantine/charts').then((mod) => {
      setChartComponents({
        LineChart: mod.LineChart,
        CartesianGrid: mod.CartesianGrid,
        XAxis: mod.XAxis,
        YAxis: mod.YAxis,
        Tooltip: mod.Tooltip,
        Legend: mod.Legend,
        Line: mod.Line,
      });
    });
  }, []);

  if (!ChartComponents) {
    return <div>Loading chart library...</div>;
  }

  const { LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } = ChartComponents;

  // Color palette for multiple lines
  const colors = [
    '#1d70d6', // Blue
    '#ff7700', // Orange
    '#2ecc71', // Green
    '#e74c3c', // Red
    '#9b59b6', // Purple
  ];

  return (
    <div style={{ marginTop: '1rem' }}>
      <LineChart
        h={height}
        data={chartData}
        dataKey="date"
        withLegend
        withTooltip
        withDots
        withXAxis
        withYAxis
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {dataKeys.map((key, index) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </div>
  );
}

