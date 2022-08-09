import React from 'react';
import { sendCommand } from '../utils';

export interface CodeEditorProps {
  language: 'typescript' | 'json';
  module?: 'commonjs' | 'esnext';
  defaultValue: string;
  className?: string;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  testId?: string;
}

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  const code = props.defaultValue;
  const url = new URL(`https://codeeditor.medplum.com/${props.language}-editor.html`);
  if (props.module) {
    url.searchParams.set('module', props.module);
  }
  return (
    <iframe
      frameBorder="0"
      src={url.toString()}
      className={props.className}
      ref={props.iframeRef}
      data-testid={props.testId}
      onLoad={(e) => sendCommand(e.currentTarget as HTMLIFrameElement, { command: 'setValue', value: code })}
    />
  );
}
