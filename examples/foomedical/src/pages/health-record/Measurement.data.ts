export interface ObservationType {
  id: string;
  code: string;
  title: string;
  description: string;
  chartDatasets: {
    label: string;
    code?: string;
    unit: string;
    backgroundColor: string;
    borderColor: string;
  }[];
}

const backgroundColor = 'rgba(29, 112, 214, 0.7)';
const borderColor = 'rgba(29, 112, 214, 1)';
const secondBackgroundColor = 'rgba(255, 119, 0, 0.7)';
const secondBorderColor = 'rgba(255, 119, 0, 1)';

export const measurementsMeta: Record<string, ObservationType> = {
  'blood-pressure': {
    id: 'blood-pressure',
    code: '85354-9',
    title: 'Blood Pressure',
    description:
      'Your blood pressure is the pressure exerted on the walls of your blood vessels. When this pressure is high, it can damage your blood vessels and increase your risk for a heart attack or stroke. We measure your blood pressure periodically to make sure it is not staying high. Hypertention is a condition that refers to consistantly high blood pressure.',
    chartDatasets: [
      {
        label: 'Diastolic',
        code: '8462-4',
        unit: 'mm[Hg]',
        backgroundColor: secondBackgroundColor,
        borderColor: secondBorderColor,
      },
      {
        label: 'Systolic',
        code: '8480-6',
        unit: 'mm[Hg]',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'body-temperature': {
    id: 'body-temperature',
    code: '8310-5',
    title: 'Body Temperature',
    description: 'Your body temperature values',
    chartDatasets: [
      {
        label: 'Body Temperature',
        unit: 'C',
        backgroundColor,
        borderColor,
      },
    ],
  },
  height: {
    id: 'height',
    code: '8302-2',
    title: 'Height',
    description: 'Your height values',
    chartDatasets: [
      {
        label: 'Height',
        unit: 'in',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'respiratory-rate': {
    id: 'respiratory-rate',
    code: '9279-1',
    title: 'Respiratory Rate',
    description: 'Your respiratory rate values',
    chartDatasets: [
      {
        label: 'Respiratory Rate',
        unit: 'breaths/minute',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'heart-rate': {
    id: 'heart-rate',
    code: '8867-4',
    title: 'Heart Rate',
    description: 'Your heart rate values',
    chartDatasets: [
      {
        label: 'Heart Rate',
        unit: 'beats/minute',
        backgroundColor,
        borderColor,
      },
    ],
  },
  weight: {
    id: 'weight',
    code: '29463-7',
    title: 'Weight',
    description: 'Your weight values',
    chartDatasets: [
      {
        label: 'Weight',
        unit: 'lbs',
        backgroundColor,
        borderColor,
      },
    ],
  },
};
