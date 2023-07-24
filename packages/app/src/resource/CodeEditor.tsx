import React, { RefObject, useEffect, useState } from 'react';
import { sendCommand } from '../utils';

export interface CodeEditorProps {
  language: 'typescript' | 'json';
  module?: 'commonjs' | 'esnext';
  defaultValue?: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  testId?: string;
  minHeight?: string;
}

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  const code = props.defaultValue;
  const iframeRef = props.iframeRef;
  const [loaded, setLoaded] = useState(false);
  const [lastDefaultCode, setLastDefaultCode] = useState<string | undefined>(code);

  useEffect(() => {
    if (loaded && iframeRef.current && code !== lastDefaultCode) {
      sendCommand(iframeRef.current, { command: 'setValue', value: code }).catch(console.error);
      setLastDefaultCode(code);
    }
  }, [iframeRef, loaded, code, lastDefaultCode]);

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
        setLoaded(true);
      }}
    />
  );
}
