import { CodeableConcept, Observation, Quantity, SampledData } from '@medplum/fhirtypes';

export type StatsFn = (data: number[]) => number;

const defaultSampling: Omit<SampledData, 'data'> = Object.freeze({});

export class DataSampler {
  private code?: CodeableConcept;
  private unit?: Pick<Quantity, 'unit' | 'code' | 'system'>;
  private readonly sampling: Omit<SampledData, 'data'>;
  private dataPoints: number[];

  constructor(opts?: { code?: CodeableConcept; sampling: Omit<SampledData, 'data'> }) {
    this.code = opts?.code;
    this.dataPoints = [];
    this.sampling = opts?.sampling;
  }

  addObservation(obs: Observation): void {
    if (!this.code) {
      this.code = obs.code;
    } else if (!codesOverlap(this.code, obs.code)) {
      throw new Error('Observation does not match code of sampled data');
    }

    if (obs.valueQuantity?.value) {
      this.checkUnit(obs.valueQuantity);
      this.addData(obs.valueQuantity.value);
    }
  }

  addData(data: number): void {
    this.dataPoints.push(data);
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

    return {
      resourceType: 'Observation',
      status: 'final',
      code,
      valueQuantity: { ...this.unit, value: fn(this.dataPoints) },
      component: [
        {
          code: this.code,
          valueSampledData: {
            origin: { ...this.unit, value: 0 },
            dimensions: 1,
            period: 60_000,
            data: this.dataPoints.join(' '),
          },
        },
      ],
    };
  }
}

function codesOverlap(a: CodeableConcept, b: CodeableConcept): boolean {
  return Boolean(a.coding?.some((c) => b.coding?.some((t) => c.system === t.system && c.code === t.code)));
}
