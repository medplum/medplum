// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useComputedColorScheme } from '@mantine/core';
import type { JSX, Ref } from 'react';
import { useEffect, useImperativeHandle, useRef } from 'react';
import type { CodeEditorHandle } from '../resource/CodeEditor';
import type { BotModule } from './setup';
import { monaco, setBotModule, ts } from './setup';

const MODEL_URI = monaco.Uri.parse('file:///index.ts');

let typesPromise: Promise<void> | undefined;

function loadMedplumTypes(): void {
  typesPromise ??= import('./medplumTypes')
    .then(({ getMedplumExtraLibs }) => {
      ts.typescriptDefaults.setExtraLibs(getMedplumExtraLibs());
    })
    .catch((err) => {
      // The editor still works without types, so don't fail; try again on the next mount
      typesPromise = undefined;
      console.warn('Failed to load type declarations for the code editor', err);
    });
}

// Start downloading the type declarations in parallel with the editor setup
loadMedplumTypes();

export interface MonacoEditorProps {
  readonly module: BotModule;
  readonly defaultValue?: string;
  readonly minHeight?: string;
  readonly testId?: string;
  readonly ref?: Ref<CodeEditorHandle>;
}

export default function MonacoEditor(props: MonacoEditorProps): JSX.Element {
  const { module, defaultValue, minHeight, testId, ref } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>(undefined);
  const colorScheme = useComputedColorScheme('light');

  useEffect(() => {
    loadMedplumTypes();

    // There is only ever one Bot editor, so reuse a fixed URI and clean up any model left behind
    monaco.editor.getModel(MODEL_URI)?.dispose();
    const model = monaco.editor.createModel('', 'typescript', MODEL_URI);
    model.updateOptions({ tabSize: 2 });

    const editor = monaco.editor.create(containerRef.current as HTMLDivElement, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
    });
    editorRef.current = editor;

    return () => {
      editorRef.current = undefined;
      editor.dispose();
      model.dispose();
    };
  }, []);

  useEffect(() => {
    setBotModule(module);
  }, [module]);

  useEffect(() => {
    // The Bot's code loads asynchronously, after the editor is created
    const model = editorRef.current?.getModel();
    if (model && defaultValue !== undefined && model.getValue() !== defaultValue) {
      model.setValue(defaultValue);
    }
  }, [defaultValue]);

  useEffect(() => {
    monaco.editor.setTheme(colorScheme === 'dark' ? 'vs-dark' : 'vs');
  }, [colorScheme]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => getModel(editorRef.current).getValue(),
      getOutput: async () => {
        const model = getModel(editorRef.current);
        const getWorker = await ts.getTypeScriptWorker();
        const worker = await getWorker(model.uri);
        const output = await worker.getEmitOutput(model.uri.toString());
        // `declaration: true` also emits a .d.ts file, so pick the JavaScript output by name
        const js = output.outputFiles.find((file) => file.name.endsWith('.js'));
        if (!js) {
          throw new Error('TypeScript compilation produced no JavaScript output');
        }
        return js.text;
      },
    }),
    []
  );

  return <div ref={containerRef} data-testid={testId} style={{ width: '100%', height: '100%', minHeight }} />;
}

function getModel(editor: monaco.editor.IStandaloneCodeEditor | undefined): monaco.editor.ITextModel {
  const model = editor?.getModel();
  if (!model) {
    throw new Error('Editor is still loading');
  }
  return model;
}
