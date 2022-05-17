import React from 'react';

export interface BotRunnerProps {
  className?: string;
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  onChange?: (value: string) => void;
}

export function BotRunner(props: BotRunnerProps): JSX.Element {
  const url = `https://codeeditor.medplum.com/bot-runner.html`;
  return <iframe src={url} className={props.className} ref={props.iframeRef} frameBorder="0"></iframe>;
}
