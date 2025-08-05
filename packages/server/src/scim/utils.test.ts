// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { convertScimToJsonPatch } from './utils';

describe('convertScimToJsonPatch', () => {
  test('Okta example', () => {
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

  test('Valid operation passthrough', () => {
    expect(
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'add',
            path: 'active',
            value: true,
          },
        ],
      })
    ).toMatchObject([
      {
        op: 'add',
        path: '/active',
        value: true,
      },
    ]);
  });

  test('Invalid schema', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['invalid'],
        Operations: [
          {
            op: 'add',
            path: 'active',
            value: true,
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: missing required schema');
  });

  test('Invalid path prefix', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'add',
            path: '/active',
            value: true,
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: path must not start with "/"');
  });

  test('Invalid operation', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'invalid',
            path: 'x',
            value: 'x',
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: unsupported operation');
  });

  test('Remove op requires path', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'remove',
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: missing required path');
  });

  test('Add op without path must be object', () => {
    expect(() =>
      convertScimToJsonPatch({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'add',
            value: 'x',
          },
        ],
      })
    ).toThrow('Invalid SCIM patch: value must be an object if path is missing');
  });
});
