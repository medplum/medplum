import { Bundle, CodeableConcept, Observation, Quantity, SampledData } from '@medplum/fhirtypes';

export type StatsFn = (data: number[]) => number | Quantity;
export type DataUnit = Pick<Quantity, 'unit' | 'code' | 'system'>;
export type SamplingInfo = Omit<SampledData, 'data'>;

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

export class DataSampler {
  private code?: CodeableConcept;
  private unit?: DataUnit;
  private readonly sampling?: Omit<SampledData, 'data'>;
  private dataPoints: number[];

  constructor(opts?: { code?: CodeableConcept; unit?: DataUnit; sampling?: SamplingInfo }) {
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
      this.addData(...obs.valueSampledData.data.split(' ').map(parseFloat));
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
            data: this.dataPoints.length ? this.dataPoints.join(' ') : undefined,
          },
        },
      ],
    };
  }
}

function codesOverlap(a: CodeableConcept, b: CodeableConcept): boolean {
  return Boolean(a.coding?.some((c) => b.coding?.some((t) => c.system === t.system && c.code === t.code)));
}
