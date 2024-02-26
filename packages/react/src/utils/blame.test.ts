import { gone } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';
import { blame } from './blame';

describe('Blame', () => {
  test('blame oldest to newest', () => {
    const history: Bundle = {
      resourceType: 'Bundle',
      type: 'history',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '1',
              lastUpdated: '2021-01-01T12:00:00Z',
            },
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '2',
              lastUpdated: '2021-01-01T12:01:00Z',
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true,
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '3',
              lastUpdated: '2021-01-01T12:02:00Z',
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: false,
          },
        },
      ],
    };

    const result = blame(history);
    expect(result).toBeDefined();
    expect(result.length).toBe(17);
    expect(result[0]).toMatchObject({
      id: '1',
      meta: {
        versionId: '1',
        lastUpdated: '2021-01-01T12:00:00Z',
      },
      value: '{',
      span: 4,
    });
  });

  test('blame newest to oldest', () => {
    const history: Bundle = {
      resourceType: 'Bundle',
      type: 'history',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '3',
              lastUpdated: '2021-01-01T12:02:00Z',
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: false,
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '2',
              lastUpdated: '2021-01-01T12:01:00Z',
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true,
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '1',
              lastUpdated: '2021-01-01T12:00:00Z',
            },
          },
        },
      ],
    };

    const result = blame(history);
    expect(result).toBeDefined();
    expect(result.length).toBe(17);
    expect(result[0]).toMatchObject({
      id: '1',
      meta: {
        versionId: '1',
        lastUpdated: '2021-01-01T12:00:00Z',
      },
      value: '{',
      span: 4,
    });
  });

  test('Handle deleted resource', () => {
    const history: Bundle = {
      resourceType: 'Bundle',
      type: 'history',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '3',
              lastUpdated: '2021-01-01T12:02:00Z',
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: false,
          },
        },
        {
          response: {
            status: '410',
            outcome: gone,
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '1',
              lastUpdated: '2021-01-01T12:00:00Z',
            },
          },
        },
      ],
    };

    const result = blame(history);
    expect(result).toBeDefined();
    expect(result.length).toBe(17);
    expect(result[0]).toMatchObject({
      id: '1',
      meta: {
        versionId: '1',
        lastUpdated: '2021-01-01T12:00:00Z',
      },
      value: '{',
      span: 4,
    });
  });
});
