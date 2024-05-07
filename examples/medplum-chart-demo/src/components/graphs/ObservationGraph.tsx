import { Paper } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import { Coding, ObservationComponent, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { LineChart } from './LineChart';
import { measurementsMeta } from './MeasurementData';
import { ChartData, ChartDataset } from 'chart.js';

interface ObservationGraphProps {
  code: Coding;
  patient: Patient;
}

export function ObservationGraph(props: ObservationGraphProps): JSX.Element {
  const medplum = useMedplum();

  const { chartDatasets } = measurementsMeta[props.code.display as string];
  const [chartData, setChartData] = useState<ChartData<'line', number[]>>();
  const observations = medplum
    .searchResources('Observation', {
      code: props.code.code,
      patient: getReferenceString(props.patient),
    })
    .read();

  useEffect(() => {
    if (observations) {
      const labels: string[] = [];
      const datasets: ChartDataset<'line', number[]>[] = chartDatasets.map((item) => ({ ...item, data: [] }));

      for (const observation of observations) {
        labels.push(formatDate(observation.effectiveDateTime));
        if (chartDatasets.length === 1) {
          datasets[0].data.push(observation.valueQuantity?.value as number);
        } else {
          for (let i = 0; i < chartDatasets.length; i++) {
            datasets[i].data.push((observation.component as ObservationComponent[])[i].valueQuantity?.value as number);
          }
        }
      }

      setChartData({ labels, datasets });
    }
  }, [chartDatasets, observations]);

  if (observations.length === 0) {
    return (
      <Paper p="md" m="md">
        No {props.code.display?.toLowerCase()} observations
      </Paper>
    );
  }

  return <div>{chartData && <LineChart chartData={chartData} />}</div>;
}
