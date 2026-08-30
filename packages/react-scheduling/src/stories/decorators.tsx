// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Resource } from '@medplum/fhirtypes';
import type { Decorator } from '@storybook/react';
import { MockDateWrapper } from './MockDateWrapper';
import { WithBookStub } from './WithBookStub';
import { WithFindStub } from './WithFindStub';
import { WithFixtures } from './WithFixtures';

// Freezes the system clock so date/time-dependent stories are deterministic.
export const withMockedDate: Decorator = (Story) => (
  <MockDateWrapper>
    <Story />
  </MockDateWrapper>
);

/**
 * Stores resources on the ambient client before the story renders.
 * @param resources - What to store first. Must be a stable reference; a module
 * constant rather than an array built inside a story.
 * @returns The decorator.
 */
export const withFixtures =
  (resources: readonly Resource[]): Decorator =>
  (Story) => (
    <WithFixtures resources={resources}>
      <Story />
    </WithFixtures>
  );

/**
 * Answers `Appointment/$find` from the stored fixtures, which MockClient cannot.
 * @param options - How the stub should answer.
 * @param options.empty - Offer no times at all, for the empty state.
 * @returns The decorator.
 */
export const withFindStub =
  (options: { empty?: boolean } = {}): Decorator =>
  (Story) => (
    <WithFindStub empty={options.empty}>
      <Story />
    </WithFindStub>
  );

/**
 * Answers `Appointment/$book` by writing what it was handed, which MockClient
 * cannot.
 * @returns The decorator.
 */
export const withBookStub = (): Decorator => (Story) => (
  <WithBookStub>
    <Story />
  </WithBookStub>
);
