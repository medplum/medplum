// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Context, JSX } from 'react';

export function maybeWrapWithContext<T>(
  ContextProvider: Context<T>['Provider'],
  contextValue: T | undefined,
  contents: JSX.Element
): JSX.Element {
  if (contextValue !== undefined) {
    return <ContextProvider value={contextValue}>{contents}</ContextProvider>;
  }

  return contents;
}
