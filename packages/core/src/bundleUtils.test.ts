import { getResourcesByType, populateReferences } from './bundleUtils';
import { Bundle, Observation, Practitioner, ServiceRequest } from '@medplum/fhirtypes';

describe('getResourcesByType', () => {
  it('groups resources by type', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Observation', id: 'o1' } as Observation },
        { resource: { resourceType: 'Practitioner', id: 'p1' } as Practitioner },
        { resource: { resourceType: 'Observation', id: 'o2' } as Observation },
        { resource: { resourceType: 'ServiceRequest', id: 's1' } as ServiceRequest },
      ],
    };
    const byType = getResourcesByType(bundle);
    expect(byType.get('Observation')?.length).toBe(2);
    expect(byType.get('Practitioner')?.length).toBe(1);
    expect(byType.get('ServiceRequest')?.length).toBe(1);
  });
});

describe('populateReferences', () => {
  it('populates Reference.resource for direct references', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'o1',
            basedOn: [{ reference: 'ServiceRequest/s1' }],
          } as Observation,
        },
        {
          resource: {
            resourceType: 'ServiceRequest',
            id: 's1',
            requester: { reference: 'Practitioner/p1' },
          } as ServiceRequest,
        },
        {
          resource: {
            resourceType: 'Practitioner',
            id: 'p1',
            name: [{ family: 'Smith' }],
          } as Practitioner,
        },
      ],
    };
    const result = populateReferences(bundle);
    const obs = result.entry![0].resource as Observation;
    const sr = result.entry![1].resource as ServiceRequest;
    expect(obs.basedOn?.[0].resource).toBeDefined();
    expect(obs.basedOn?.[0].resource?.id).toBe('s1');
    expect(sr.requester?.resource).toBeDefined();
    expect(sr.requester?.resource?.id).toBe('p1');
  });

  it('does not throw on missing references', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            id: 'o1',
            basedOn: [{ reference: 'ServiceRequest/doesnotexist' }],
          } as Observation,
        },
      ],
    };
    expect(() => populateReferences(bundle)).not.toThrow();
    const obs = bundle.entry![0].resource as Observation;
    expect(obs.basedOn?.[0].resource).toBeUndefined();
  });
}); 