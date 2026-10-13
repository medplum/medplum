// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Center, Loader } from '@mantine/core';
import { ErrorBoundary } from '@medplum/react';
import type { JSX, Ref } from 'react';
import { lazy, Suspense } from 'react';

// Monaco and the Bot type declarations are large, so load them only when an editor is shown.
// Only type imports from ../monaco are allowed in this file, or Monaco ends up in the main bundle.
const MonacoEditor = lazy(() => import('../monaco/MonacoEditor'));

export interface CodeEditorHandle {
  /** Returns the TypeScript source code. */
  getValue(): string;
  /** Returns the compiled JavaScript output. */
  getOutput(): Promise<string>;
}

export interface CodeEditorProps {
  readonly module: 'commonjs' | 'esnext';
  readonly defaultValue?: string;
  readonly testId?: string;
  readonly minHeight?: string;
  readonly ref?: Ref<CodeEditorHandle>;
}

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <Center mih={props.minHeight}>
            <Loader />
          </Center>
        }
      >
        <MonacoEditor {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
