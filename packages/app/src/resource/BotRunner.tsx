import React from 'react';

export interface BotRunnerProps {
  className?: string;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  testId?: string;
  minHeight?: string;
  onChange?: (value: string) => void;
}

export function BotRunner(props: BotRunnerProps): JSX.Element {
  const url = `https://codeeditor.medplum.com/bot-runner.html`;
  return (
    <iframe
      frameBorder="0"
      src={url}
      className={props.className}
      ref={props.iframeRef}
      data-testid={props.testId}
      style={{ width: '100%', height: '100%', minHeight: props.minHeight }}
    ></iframe>
  );
}
