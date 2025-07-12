import { Bundle } from '@medplum/fhirtypes';
import { getResourcesByType, populateReferences } from './bundleUtils';

describe('getResourcesByType', () => {
  it('groups resources by type', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        { resource: { resourceType: 'Observation', id: 'o1' } },
        { resource: { resourceType: 'Practitioner', id: 'p1' } },
        { resource: { resourceType: 'Observation', id: 'o2' } },
        { resource: { resourceType: 'ServiceRequest', id: 's1' } },
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
            resourceType: 'Practitioner',
            id: 'p1',
            name: [{ family: 'Smith' }],
          },
        },
        {
          resource: {
            resourceType: 'ServiceRequest',
            id: 's1',
            requester: { reference: 'Practitioner/p1' },
          },
        },
        {
          resource: {
            resourceType: 'Observation',
            id: 'o1',
            basedOn: [{ reference: 'ServiceRequest/s1' }],
          },
        },
      ],
    };

    const result = populateReferences(bundle);

    const obs = result.entry?.find((e) => e.resource?.resourceType === 'Observation')?.resource as any;
    const sr = result.entry?.find((e) => e.resource?.resourceType === 'ServiceRequest')?.resource as any;

    expect(obs.basedOn?.[0].resource).toBeDefined();
    expect(obs.basedOn?.[0].resource.id).toBe('s1');

    expect(sr.requester?.resource).toBeDefined();
    expect(sr.requester?.resource.id).toBe('p1');
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
          },
        },
      ],
    };

    expect(() => populateReferences(bundle)).not.toThrow();

    const obs = bundle.entry![0].resource;
    expect(obs.basedOn?.[0].resource).toBeUndefined();
  });
});
