// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Bundle, CodeableConcept, Observation, Quantity, SampledData } from '@medplum/fhirtypes';
import { getReferenceString } from './utils';

export type StatsFn = (data: number[]) => number | Quantity;
export type QuantityUnit = Pick<Quantity, 'unit' | 'code' | 'system'>;
export type SamplingInfo = Omit<SampledData, 'data'>;

/**
 * Summarizes a group of Observations into a single computed summary value, with the individual values
 * preserved in `Observation.component.valueSampledData`.
 *
 * @param observations - The Observations to summarize.
 * @param summaryCode - The code for the summarized value.
 * @param summarizeFn - Function to summarize the data points.
 * @returns - The summary Observation resource.
 */
export function summarizeObservations(
  observations: Observation[] | Bundle<Observation>,
  summaryCode: CodeableConcept,
  summarizeFn: StatsFn
): Observation {
  const sampler = new DataSampler();
  if (!Array.isArray(observations)) {
    observations = observations.entry?.map((e) => e.resource as Observation) ?? [];
  }
  for (const obs of observations) {
    sampler.addObservation(obs);
  }
  return sampler.summarize(summaryCode, summarizeFn);
}

export interface DataSampleOptions {
  /** Code for the data points. */
  code?: CodeableConcept;
  /** Unit for the data points. */
  unit?: QuantityUnit;
  /** Sampling information for high-frequency Observations. */
  sampling?: Omit<SampledData, 'data'>;
}

export class DataSampler {
  private code?: CodeableConcept;
  private unit?: QuantityUnit;
  private readonly sampling?: Omit<SampledData, 'data'>;
  private readonly dataPoints: number[];

  /**
   * @param opts - Optional parameters.
   */
  constructor(opts?: DataSampleOptions) {
    this.dataPoints = [];
    this.code = opts?.code;
    this.unit = opts?.unit;
    this.sampling = opts?.sampling;
  }

  addObservation(obs: Observation): void {
    if (!this.code) {
      this.code = obs.code;
    } else if (!codesOverlap(this.code, obs.code)) {
      throw new Error('Observation does not match code of sampled data');
    }

    if (obs.valueQuantity?.value !== undefined) {
      this.checkUnit(obs.valueQuantity);
      this.addData(obs.valueQuantity.value);
    } else if (obs.valueInteger !== undefined) {
      this.addData(obs.valueInteger);
    } else if (obs.valueSampledData?.data) {
      this.checkUnit(obs.valueSampledData.origin);
      this.addData(...expandSampledData(obs.valueSampledData));
    }
  }

  addData(...data: number[]): void {
    this.dataPoints.push(...data);
  }

  private checkUnit(quantity: Quantity): void {
    if (!this.unit) {
      this.unit = quantity;
    } else if (quantity.code && quantity.system) {
      if (this.unit.system !== quantity.system || this.unit.code !== quantity.code) {
        throw new Error('Incorrect unit for Observation');
      }
    } else if (quantity.unit) {
      if (this.unit.unit !== quantity.unit) {
        throw new Error('Incorrect unit for Observation');
      }
    }
  }

  summarize(code: CodeableConcept, fn: StatsFn): Observation {
    if (!this.code) {
      throw new Error('Code is required for data points');
    }

    const computedValue = fn(this.dataPoints);
    return {
      resourceType: 'Observation',
      status: 'final',
      code,
      valueQuantity: typeof computedValue === 'number' ? { ...this.unit, value: computedValue } : computedValue,
      component: [
        {
          code: this.code,
          valueSampledData: {
            origin: { ...this.unit, value: 0 },
            dimensions: 1,
            period: 0,
            ...this.sampling,
            data: compressSampledData(this.dataPoints, this.sampling),
          },
        },
      ],
    };
  }
}

function codesOverlap(a: CodeableConcept, b: CodeableConcept): boolean {
  return Boolean(a.coding?.some((c) => b.coding?.some((t) => c.system === t.system && c.code === t.code)));
}

export function expandSampledData(sample: SampledData): number[] {
  return sample.data?.split(' ').map((d) => parseFloat(d) * (sample.factor ?? 1) + (sample.origin.value ?? 0)) ?? [];
}

function compressSampledData(data: number[], sampling?: SamplingInfo): string | undefined {
  if (!data.length) {
    return undefined;
  }
  return data.map((d) => (d - (sampling?.origin.value ?? 0)) / (sampling?.factor ?? 1)).join(' ');
}

export function expandSampledObservation(obs: Observation): Observation[] {
  const results: Observation[] = [];
  const obsTimestamp = obs.effectiveInstant ?? obs.effectiveDateTime ?? obs.effectivePeriod?.start;
  const startTime = obsTimestamp ? Date.parse(obsTimestamp).valueOf() : 0;

  if (obs.valueSampledData) {
    results.push(...convertSampleToObservations(obs.valueSampledData, startTime, obs));
  }
  if (obs.component) {
    for (const component of obs.component) {
      if (component.valueSampledData) {
        results.push(...convertSampleToObservations(component.valueSampledData, startTime, { ...obs, ...component }));
      }
    }
  }
  return results;
}

function convertSampleToObservations(sample: SampledData, startTime: number, template: Observation): Observation[] {
  const results: Observation[] = [];
  const values = expandSampledData(sample);
  const parentObservation = getReferenceString(template);

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const dataPointTime = startTime + Math.floor(i / sample.dimensions) * sample.period;
    results.push({
      ...template,
      id: undefined,
      effectiveInstant: undefined,
      effectivePeriod: undefined,
      effectiveTiming: undefined,
      effectiveDateTime: dataPointTime ? new Date(dataPointTime).toISOString() : undefined,
      valueQuantity: { ...sample.origin, value },
      valueSampledData: undefined,
      component: undefined,
      derivedFrom: parentObservation
        ? [...(template.derivedFrom ?? []), { reference: parentObservation }]
        : template.derivedFrom,
    });
  }
  return results;
}
