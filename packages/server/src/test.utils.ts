// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Resource } from '@medplum/fhirtypes';
import express from 'express';
import util from 'node:util';
import request from 'supertest';
import type { InspectOptionsStylized } from 'util';
import { initApp, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import type { MedplumServerConfig } from './config/types';
import { getSystemRepo } from './fhir/repo';
import type { StrictTestProjectOptions } from './test.setup';
import { createTestProject } from './test.setup';

/* We wrap results of these functions in this TestData<> branding to
 * express some constraints on usage:
 * - Using these values is only allowed inside a test context, such as a
 *   `test()` or `beforeEach()` callback
 * - These are not part of the Medplum Stable API, and should not be relied
 *   on to be consistent across versions.
 */
type TestData<T> = T & { __testdata?: true };

const uninitialized = Symbol('TestData.Uninitialized');
const systemRepo = getSystemRepo();

export function prepare<T extends object>(
  setup: () => T | Promise<T>,
  teardown?: (data: T) => void | Promise<void>
): TestData<T> {
  let data: T | typeof uninitialized = uninitialized;
  beforeAll(async () => {
    data = await setup();
  });

  if (teardown) {
    afterAll(async () => {
      await teardown(data as T);
      data = uninitialized;
    });
  }

  // Because we can't alter our Proxy target after it is instantiated, we
  // create a stub object to use and defer all actual access to the `data`
  // member through proxy traps.
  //
  // We add one additional customization to the target to catch Node `inspect`
  // invocations; Node bypasses the Proxy object and accesses the target
  // directly, so to support `console.log(testdata)` we need a special hook
  // here.
  //
  // We tell Typescript that this object is of type `T`, which makes the Proxy
  // wrapping it behave as type `T` in the type system.
  const target = {
    [util.inspect.custom](depth: number, opts: InspectOptionsStylized) {
      if (data === uninitialized) {
        return util.inspect('<Uninitialized TestData>', { ...opts, depth });
      }
      return util.inspect(data, { ...opts, depth });
    },
  } as T;

  return new Proxy(target, {
    get(_target, prop) {
      if (data === uninitialized) {
        throw new Error(`Can't read \`${String(prop)}\` from uninitialized testdata. Are you in the test context?`);
      }
      return data[prop as keyof T];
    },
  });
}

/* eslint @typescript-eslint/explicit-function-return-type: 0
  ---
  TestData generation functions are not part of our stable API, and are
  currently an evolving exploration on how we can make writing tests easier.
  Omitting the explicit return type lets us rely on the inferred TS types
  within this package, and since no other packages should depend on them it
  should not cause TS inference slowdowns.
*/

export function prepareApp(configOverrides: Partial<MedplumServerConfig> = {}) {
  return prepare(
    async () => {
      const app = express();
      const config = await loadTestConfig();
      Object.assign(config, configOverrides);
      const server = initApp(app, config);
      return { server, request: request(app) };
    },
    () => shutdownApp()
  );
}

// Creates a resource during the test suite
//
// If depending on other testdata that won't be initialized at call time, wrap the
// argument in a thunk:
// ```
//   const project = prepareProject();
//   const patient = prepareResource<Patient>(() => {
//     resourceType: 'Patient',
//     meta: { project.project.id },
//  });
// ```
export function prepareResource<T extends Resource>(resource: T | (() => T)) {
  return prepare(() => systemRepo.createResource<T>(typeof resource === 'function' ? resource() : resource));
}

// TODO: Figure out if there's a nicer way to wrap a function taking generics
export function prepareProject<const T extends StrictTestProjectOptions<T>>(options?: T | (() => T)) {
  return prepare(() => createTestProject<T>(typeof options === 'function' ? options() : options));
}
