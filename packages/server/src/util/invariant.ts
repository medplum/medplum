// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Helper that tests a condition that we believe should always be true.
//
// This allows programmers to make an assertion to the type system that
// TypeScript can't natively infer. It will throw a runtime error if the
// assertion is ever violated.
//
// Example: After applying a filter to a query that requires the existence of a
// field, you can use invariant to tell TS that the object must have that
// attribute.
//
// ```
//   const user = systemRepo.searchOne<User>({
//     resourceType: 'User',
//     filters: [{ code: 'email', operator: Operator.EQUALS, value: 'alice@example.com' }]
//   });
//
//   invariant(user.email); // refines user.email from `string | undefined` to `string`
//   const result: string = user.email.toLowerCase()
// ```
export function invariant(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? 'Invariant violation');
  }
}
