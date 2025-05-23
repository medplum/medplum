import { Bundle, Observation } from '@medplum/fhirtypes';
import { UCUM } from './constants';
import { DataSampler, summarizeObservations } from './datasampler';

function sum(x: number, y: number): number {
  return x + y;
}

describe('DataSampler', () => {
  test('Empty summary', () => {
    const sample = new DataSampler({ code: { text: 'Data' } });
    const result = sample.summarize({ text: 'Test' }, (data) => data.reduce(sum, 0));

    expect(result).toStrictEqual<Observation>(
      expect.objectContaining({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test' },
        valueQuantity: { value: 0 },
        component: [
          {
            code: { text: 'Data' },
            valueSampledData: {
              origin: { value: 0 },
              dimensions: 1,
              period: 0,
            },
          },
        ],
      })
    );
  });

  test('Single data point', () => {
    const sample = new DataSampler({ code: { text: 'Data' } });
    sample.addData(2);
    const result = sample.summarize({ text: 'Test' }, (data) => data.reduce(sum, 0));

    expect(result).toStrictEqual<Observation>(
      expect.objectContaining({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test' },
        valueQuantity: { value: 2 },
        component: [
          {
            code: { text: 'Data' },
            valueSampledData: {
              origin: { value: 0 },
              dimensions: 1,
              period: 0,
              data: '2',
            },
          },
        ],
      })
    );
  });

  test('Sum of two data points', () => {
    const sample = new DataSampler({ code: { text: 'Data' } });
    sample.addData(1, 1);
    const result = sample.summarize({ text: 'Test' }, (data) => data.reduce(sum, 0));

    expect(result).toStrictEqual<Observation>(
      expect.objectContaining({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test' },
        valueQuantity: { value: 2 },
        component: [
          {
            code: { text: 'Data' },
            valueSampledData: {
              origin: { value: 0 },
              dimensions: 1,
              period: 0,
              data: '1 1',
            },
          },
        ],
      })
    );
  });

  test('Average of Observations', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 72, unit: 'bpm' },
    });
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 55, unit: 'bpm' },
    });
    const result = sample.summarize(
      { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
      (data) => data.reduce(sum, 0) / data.length
    );

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
        valueQuantity: { value: 63.5, unit: 'bpm' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 55',
            },
          },
        ],
      })
    );
  });

  test('Code and unit matching ignores display text', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
      valueQuantity: { value: 72, unit: 'bpm', system: UCUM, code: '{beats}/min' },
    });
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Pulse' }] },
      valueQuantity: { value: 55, unit: 'beats per min.', system: UCUM, code: '{beats}/min' },
    });
    const result = sample.summarize(
      { coding: [{ system: 'http://loinc.org', code: '41920-0', display: 'Heart rate 1h Mean' }] },
      (data) => data.reduce(sum, 0) / data.length
    );

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '41920-0', display: 'Heart rate 1h Mean' }] },
        valueQuantity: { value: 63.5, unit: 'bpm', system: UCUM, code: '{beats}/min' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm', system: UCUM, code: '{beats}/min' },
              dimensions: 1,
              period: 0,
              data: '72 55',
            },
          },
        ],
      })
    );
  });

  test('Throws on data point unit mismatch', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
      valueQuantity: { value: 72, system: UCUM, code: 'kg' },
    });

    expect(() =>
      sample.addObservation({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
        valueQuantity: { value: 55, system: UCUM, code: '[lb_av]', unit: 'lb' },
      })
    ).toThrow(/^Incorrect unit/);

    expect(() =>
      sample.addObservation({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
        valueQuantity: { value: 55, unit: 'lb' },
      })
    ).toThrow(/^Incorrect unit/);
  });

  test('Throws on data point code mismatch', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
      valueQuantity: { value: 72, system: UCUM, code: 'kg' },
    });

    expect(() =>
      sample.addObservation({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '27113001', display: 'Body weight' }] },
        valueQuantity: { value: 55, system: UCUM, code: 'kg' },
      })
    ).toThrow(/does not match code/);
  });

  test('Requires code for data points', () => {
    const sample = new DataSampler();
    sample.addData(1, 2, 3);
    expect(() => sample.summarize({ text: 'Summary' }, (data) => data.reduce(sum, 0))).toThrow(/code .* required/i);
  });

  test('Computed value with unit different from data points', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 72, unit: 'bpm' },
    });
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 55, unit: 'bpm' },
    });
    const result = sample.summarize({ text: 'Skewness' }, (_data) => ({ value: 0, unit: 'skew' }));

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Skewness' },
        valueQuantity: { value: 0, unit: 'skew' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 55',
            },
          },
        ],
      })
    );
  });

  test('Allow recording plain integer values from Observation', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 72, unit: 'bpm' },
    });
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueInteger: 55,
    });
    const result = sample.summarize(
      { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
      (data) => data.reduce(sum, 0) / data.length
    );

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
        valueQuantity: { value: 63.5, unit: 'bpm' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 55',
            },
          },
        ],
      })
    );
  });

  test('Allow recording full data set from SampledData', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 72, unit: 'bpm' },
    });
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueSampledData: {
        origin: { value: 0, unit: 'bpm' },
        period: 0,
        dimensions: 1,
        data: '55 88 11',
      },
    });
    const result = sample.summarize(
      { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
      (data) => data.reduce(sum, 0) / data.length
    );

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
        valueQuantity: { value: 56.5, unit: 'bpm' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 55 88 11',
            },
          },
        ],
      })
    );
  });

  test('Adjusts for SampledData scaling', () => {
    const sample = new DataSampler();
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueQuantity: { value: 72, unit: 'bpm' },
    });
    sample.addObservation({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      valueSampledData: {
        origin: { value: 60, unit: 'bpm' },
        period: 0,
        dimensions: 1,
        factor: 0.5,
        data: '6 14 -20',
      },
    });
    const result = sample.summarize(
      { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
      (data) => data.reduce(sum, 0) / data.length
    );

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '41920-0' }] },
        valueQuantity: { value: 63, unit: 'bpm' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 63 67 50',
            },
          },
        ],
      })
    );
  });

  test('summarizeObservations', () => {
    const obs: Observation[] = [
      {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
        valueQuantity: { value: 72, unit: 'bpm' },
      },
      {
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
        valueQuantity: { value: 55, unit: 'bpm' },
      },
    ];
    const result = summarizeObservations(obs, { text: 'Skewness' }, (_data) => ({ value: 0, unit: 'skew' }));

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Skewness' },
        valueQuantity: { value: 0, unit: 'skew' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 55',
            },
          },
        ],
      })
    );
  });

  test('summarizeObservations with Bundle', () => {
    const obs: Bundle<Observation> = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueQuantity: { value: 72, unit: 'bpm' },
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueQuantity: { value: 55, unit: 'bpm' },
          },
        },
      ],
    };
    const result = summarizeObservations(obs, { text: 'Skewness' }, (_data) => ({ value: 0, unit: 'skew' }));

    expect(result).toStrictEqual(
      expect.objectContaining<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Skewness' },
        valueQuantity: { value: 0, unit: 'skew' },
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
            valueSampledData: {
              origin: { value: 0, unit: 'bpm' },
              dimensions: 1,
              period: 0,
              data: '72 55',
            },
          },
        ],
      })
    );
  });
});
