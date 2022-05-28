import React from 'react';
import { sendCommand } from './utils';

export interface CodeEditorProps {
  language: 'typescript' | 'json';
  defaultValue: string;
  className?: string;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  testId?: string;
  onChange?: (value: string) => void;
}

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  const code = props.defaultValue;
  const url = `https://codeeditor.medplum.com/${props.language}-editor.html`;
  return (
    <iframe
      frameBorder="0"
      src={url}
      className={props.className}
      ref={props.iframeRef}
      data-testid={props.testId}
      onLoad={(e) => sendCommand(e.currentTarget as HTMLIFrameElement, { command: 'setValue', value: code })}
    />
  );
}
