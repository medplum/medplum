import { RefObject } from 'react';
import { sendCommand } from '../utils';

export interface CodeEditorProps {
  readonly language: 'typescript' | 'json';
  readonly module?: 'commonjs' | 'esnext';
  readonly defaultValue?: string;
  readonly iframeRef: RefObject<HTMLIFrameElement>;
  readonly testId?: string;
  readonly minHeight?: string;
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
      style={{ width: '100%', height: '100%', minHeight: props.minHeight }}
      ref={props.iframeRef}
      data-testid={props.testId}
      onLoad={(e) => {
        sendCommand(e.currentTarget as HTMLIFrameElement, { command: 'setValue', value: code }).catch(console.error);
      }}
    />
  );
}
