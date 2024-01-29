import { RefObject } from 'react';

export interface BotRunnerProps {
  readonly className?: string;
  readonly iframeRef?: RefObject<HTMLIFrameElement>;
  readonly testId?: string;
  readonly minHeight?: string;
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
