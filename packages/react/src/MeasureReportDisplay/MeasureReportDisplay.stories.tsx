import { Measure } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { Meta } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Document } from '../Document/Document';
import { MeasureReportDisplay } from './MeasureReportDisplay';

export default {
  title: 'Medplum/MeasureReportDisplay',
  component: MeasureReportDisplay,
} as Meta;

function createMeasure(title: string, url: string, subtitle?: string): Measure {
  return {
    resourceType: 'Measure',
    status: 'active',
    url,
    title,
    subtitle,
  };
}

export const Basic = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const [measure, setMeasure] = useState<Measure | undefined>();

  useEffect(() => {
    (async (): Promise<boolean> => {
      const newMeasure = await medplum.createResource(
        createMeasure('Test Measure', 'http://example.com', 'Test Subtitle')
      );
      setMeasure(newMeasure);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <MeasureReportDisplay
        measureReport={{
          resourceType: 'MeasureReport',
          id: 'basic-example',
          measure: measure?.url as string,
          status: 'complete',
          type: 'individual',
          period: { start: '2021-01-01', end: '2021-12-31' },
          group: [
            {
              id: 'group-1',
              measureScore: {
                value: 67,
                unit: '%',
              },
            },
          ],
        }}
      />
    </Document>
  );
};

export const Multiple = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const [measure, setMeasure] = useState<Measure | undefined>();

  useEffect(() => {
    (async (): Promise<boolean> => {
      const newMeasure = await medplum.createResource(
        createMeasure(
          'Multiple Measures',
          'http://example-multiple.com',
          'Multiple Measures with a % and a volume measurement'
        )
      );
      setMeasure(newMeasure);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <MeasureReportDisplay
        measureReport={{
          resourceType: 'MeasureReport',
          id: 'basic-example',
          measure: measure?.url as string,
          status: 'complete',
          type: 'individual',
          period: { start: '2021-01-01', end: '2021-12-31' },
          group: [
            {
              id: 'group-1',
              measureScore: {
                value: 67,
                unit: '%',
              },
            },
            {
              id: 'group-2',
              measureScore: {
                value: 50,
                unit: 'ml',
              },
            },
          ],
        }}
      />
    </Document>
  );
};

export const WithPopulation = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const [measure, setMeasure] = useState<Measure | undefined>();

  useEffect(() => {
    (async (): Promise<boolean> => {
      const newMeasure = await medplum.createResource(
        createMeasure(
          'Population Measure',
          'http://example-population.com',
          'Population Measurement with Numerator and Denominator'
        )
      );
      setMeasure(newMeasure);
      return true;
    })()
      .then(setLoaded)
      .catch(console.log);
  }, [medplum]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Document>
      <MeasureReportDisplay
        measureReport={{
          resourceType: 'MeasureReport',
          id: 'basic-example',
          measure: measure?.url as string,
          status: 'complete',
          type: 'individual',
          period: { start: '2021-01-01', end: '2021-12-31' },
          group: [
            {
              id: 'group-1',
              population: [
                {
                  code: {
                    coding: [
                      {
                        code: 'numerator',
                      },
                    ],
                  },
                  count: 10,
                },
                {
                  code: {
                    coding: [
                      {
                        code: 'denominator',
                      },
                    ],
                  },
                  count: 100,
                },
              ],
            },
            {
              id: 'group-2',
              measureScore: {
                value: 50,
                unit: 'ml',
              },
            },
            {
              id: 'group-3',
              population: [
                {
                  code: {
                    coding: [
                      {
                        code: 'numerator',
                      },
                    ],
                  },
                  count: 4,
                },
                {
                  code: {
                    coding: [
                      {
                        code: 'denominator',
                      },
                    ],
                  },
                  count: 5,
                },
              ],
            },
            {
              id: 'group-4',
              measureScore: {
                value: 12,
                unit: 'ml',
              },
            },
          ],
        }}
      />
    </Document>
  );
};
