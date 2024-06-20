import { Paper } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import { Coding, Observation, ObservationComponent, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { LineChart } from './LineChart';
import { measurementStyles, ObservationType } from './measurement-constants';
import { ChartData, ChartDataset } from 'chart.js';

interface ObservationGraphProps {
  code: Coding;
  patient: Patient;
}

export function ObservationGraph(props: ObservationGraphProps): JSX.Element {
  const medplum = useMedplum();

  // Get the chartDataset codes and units
  const { chartDatasets } = getMeasurementStyles(props.code);
  const [chartData, setChartData] = useState<ChartData<'line', number[], string>>();

  function getMeasurementStyles(code: Coding): ObservationType {
    const display = code.display;
    if (!display) {
      throw new Error('Invalid code');
    }

    return measurementStyles[display];
  }

  // Get all of the observations for the current code and patient
  const observations = medplum
    .searchResources('Observation', {
      code: props.code.code,
      patient: getReferenceString(props.patient),
    })
    .read();

  useEffect(() => {
    if (observations) {
      const labels: string[] = [];
      // For each data item, create an object containing the code and units, as well as a data array to store the measurement values
      const datasets: ChartDataset<'line', number[]>[] = chartDatasets.map((item) => ({ ...item, data: [] }));

      getObservationValues(observations, labels, chartDatasets, datasets);

      // Set your chart data with the labels and observation measurments
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

/**
 * This function takes the observations to be graphed as well as other relevant data and adds the values to datasets that can be
 * used in Chart.js
 *
 * @param observations - An array of observations whose data will be graphed
 * @param labels - The labels that will appear on the axes of the graph
 * @param chartDatasets - Data about the graph, including the name, code, units, and color details
 * @param datasets - An array of datasets that will have the observation values added to them
 */
function getObservationValues(
  observations: Observation[],
  labels: string[],
  chartDatasets: {
    label: string;
    code?: string | undefined;
    unit: string;
    backgroundColor: string;
    borderColor: string;
  }[],
  datasets: ChartDataset<'line', number[]>[]
): void {
  for (const observation of observations) {
    // For each observation add the date that it was taken as a label
    labels.push(formatDate(observation.effectiveDateTime));
    // If there is only one observation type for the chart, add the observation measurement to your data
    if (chartDatasets.length === 1) {
      datasets[0].data.push(observation.valueQuantity?.value as number);
    } else {
      // If there is more than one type, loop over each type and add the data. For example, blood pressure may have a systolic and diastolic measurement.
      // For more details, see https://www.medplum.com/docs/charting/capturing-vital-signs#multi-component-observations
      for (let i = 0; i < chartDatasets.length; i++) {
        datasets[i].data.push((observation.component as ObservationComponent[])[i].valueQuantity?.value as number);
      }
    }
  }
}
