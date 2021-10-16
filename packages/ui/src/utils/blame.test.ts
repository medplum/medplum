import { Bundle } from '@medplum/core';
import { blame } from './blame';

describe('Blame', () => {

  test('blame', () => {
    const history: Bundle = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '1'
            }
          }
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '2'
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true
          }
        },
        {
          resource: {
            resourceType: 'Patient',
            id: '123',
            meta: {
              versionId: '3'
            },
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: false
          }
        }
      ]
    };

    const result = blame(history);
    expect(result).not.toBeUndefined();
  });

});
