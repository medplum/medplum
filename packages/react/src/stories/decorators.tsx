// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MockClient, MockStateJson } from '@medplum/mock';
import { createMockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { Decorator } from '@storybook/react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { MockDateWrapper } from './MockDateWrapper';

export const withMockedDate: Decorator = (Story) => {
  return (
    <MockDateWrapper>
      <Story />
    </MockDateWrapper>
  );
};

/**
 * Gives a story its own `MockClient` holding only the Mock State in
 * `parameters.mockState` (see `PatientSummaryStates` in `@medplum/mock`), seeded under the mocked
 * date so timestamps are stable. Stories without the parameter keep the shared seeded client.
 * @param Story - The story.
 * @param context - The story context.
 * @returns The story, inside its own client when a Mock State is set.
 */
export const withMockState: Decorator = (Story, context) => {
  const state = context.parameters.mockState as MockStateJson | undefined;
  return state ? (
    <MockDateWrapper>
      <MockStateProvider state={state}>
        <Story />
      </MockStateProvider>
    </MockDateWrapper>
  ) : (
    <Story />
  );
};

function MockStateProvider(props: { readonly state: MockStateJson; readonly children: ReactNode }): JSX.Element | null {
  const { state } = props;
  const [failure, setFailure] = useState<{ state: MockStateJson; message: string }>();
  const [ready, setReady] = useState<{ state: MockStateJson; client: MockClient }>();

  useEffect(() => {
    let active = true;
    createMockClient(state)
      .then((client) => active && setReady({ state, client }))
      .catch((error: unknown) => {
        if (active) {
          setFailure({ state, message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [state]);

  if (failure?.state === state) {
    return <div role="alert">{failure.message}</div>;
  }

  return ready?.state === state ? <MedplumProvider medplum={ready.client}>{props.children}</MedplumProvider> : null;
}
