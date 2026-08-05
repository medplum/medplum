// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Mimics identity-obj-proxy for CSS modules in tests.
export default new Proxy(
  {},
  {
    get: (_target, prop) => prop,
  }
);
