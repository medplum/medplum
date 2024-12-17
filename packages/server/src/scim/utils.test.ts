import { convertScimToJsonPatch } from './utils';

test('convertScimToJsonPatch', () => {
  // See https://developer.okta.com/docs/api/openapi/okta-scim/guides/scim-20/#update-a-specific-user-patch
  expect(
    convertScimToJsonPatch({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [
        {
          op: 'replace',
          value: {
            active: false,
          },
        },
      ],
    })
  ).toEqual([
    {
      op: 'replace',
      path: '/active',
      value: false,
    },
  ]);
});
