// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import type { Coding, Resource } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import type { Decorator } from '@storybook/react';
import { MockDateWrapper } from './MockDateWrapper';
import { WithBookStub } from './WithBookStub';
import { WithCancelStub } from './WithCancelStub';
import { WithFindStub } from './WithFindStub';
import { WithFixtures } from './WithFixtures';
import { WithValueSets } from './WithValueSets';
import { WithValueSetStub } from './WithValueSetStub';

/**
 * Frames a story in a page, under the heading its `heading` parameter gives. Keeping the frame here leaves the
 * story rendering only the component, which is what Storybook's Code panel then shows.
 * @param Story - The story to frame.
 * @param context - The story context, whose parameters may carry a `heading`.
 * @returns The framed story.
 */
export const withDocument: Decorator = (Story, context) => (
  <Document>
    {context.parameters.heading && (
      <Title order={4} mb="md">
        {context.parameters.heading}
      </Title>
    )}
    <Story />
  </Document>
);

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

/**
 * Answers `Appointment/[id]/$cancel` by cancelling what it names, which MockClient
 * cannot.
 * @returns The decorator.
 */
export const withCancelStub = (): Decorator => (Story) => (
  <WithCancelStub>
    <Story />
  </WithCancelStub>
);

/**
 * Expands the value sets these components bind to, which MockClient answers with
 * example codes.
 * @returns The decorator.
 */
export const withValueSetStub = (): Decorator => (Story) => (
  <WithValueSetStub>
    <Story />
  </WithValueSetStub>
);

/**
 * Answers `ValueSet/$expand` from a fixed set of value sets, which MockClient answers only with
 * placeholders.
 * @param valueSets - Concepts to offer, keyed by the value set's canonical url.
 * @returns The decorator.
 */
export const withValueSets =
  (valueSets: Record<string, Coding[]>): Decorator =>
  (Story) => (
    <WithValueSets valueSets={valueSets}>
      <Story />
    </WithValueSets>
  );
