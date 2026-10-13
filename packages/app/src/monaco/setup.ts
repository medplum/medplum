// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// One-time Monaco setup. This module is only reachable through a dynamic import,
// so none of Monaco ends up in the main app bundle.
//
// Rather than the `monaco-editor` root entry, which registers every language, this loads the
// core editor with all editor features, plus TypeScript highlighting and the TypeScript language service.

import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/typescript/register';
import * as ts from 'monaco-editor/languages/features/typescript/register';
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker';

export { monaco, ts };

self.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string) =>
    label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker(),
};

/**
 * Compiler options for Bot code.
 *
 * These must match the hosted editor this component replaced, because the compiled output is saved as the
 * Bot's `executableCode`. That editor used the TypeScript Playground sandbox defaults
 * (https://www.typescriptlang.org/js/sandbox/compilerOptions.js, for TypeScript 5+) with the overrides from
 * https://github.com/medplum/medplum-codeeditor/blob/main/typescript-editor.js.
 */
export const BOT_COMPILER_OPTIONS: ts.CompilerOptions = {
  // Sandbox defaults
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictPropertyInitialization: true,
  strictBindCallApply: true,
  noImplicitThis: true,
  noImplicitReturns: true,
  noUncheckedIndexedAccess: false,
  useDefineForClassFields: false,
  alwaysStrict: true,
  allowUnreachableCode: false,
  allowUnusedLabels: false,
  downlevelIteration: false,
  noEmitHelpers: false,
  noLib: false,
  noStrictGenericChecks: false,
  noUnusedLocals: false,
  noUnusedParameters: false,
  esModuleInterop: true,
  preserveConstEnums: false,
  removeComments: false,
  checkJs: false,
  allowJs: false,
  declaration: true,
  importHelpers: false,
  experimentalDecorators: false,
  emitDecoratorMetadata: false,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  jsx: ts.JsxEmit.React,

  // Overrides from the hosted editor
  target: ts.ScriptTarget.ES2020,
  skipLibCheck: true,
  skipDefaultLibCheck: true,

  // Monaco's own default, needed for in-memory models
  allowNonTsExtensions: true,
};

export type BotModule = 'commonjs' | 'esnext';

export function setBotModule(module: BotModule): void {
  ts.typescriptDefaults.setCompilerOptions({
    ...BOT_COMPILER_OPTIONS,
    module: module === 'commonjs' ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
  });
}
