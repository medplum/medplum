import { useEffect, useRef, useState } from 'react';
import { sendCommand } from '../utils/dom';

const CCDA_VIEWER_URL = 'https://ccda.medplum.com';

export interface CcdaDisplayProps {
  readonly url?: string;
  readonly maxWidth?: number;
}

export function CcdaDisplay(props: CcdaDisplayProps): JSX.Element | null {
  const { url } = props;
  const [shouldSend, setShouldSend] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!url) {
      return;
    }
    if (shouldSend && iframeRef.current) {
      sendCommand(iframeRef.current, { command: 'loadCcdaXml', value: url }).catch(console.error);
      setShouldSend(false);
    }
  }, [url, shouldSend]);

  if (!url) {
    return null;
  }

  return (
    <div data-testid="ccda-iframe" style={{ maxWidth: props.maxWidth, minHeight: 400 }}>
      <iframe
        title="C-CDA Viewer"
        width="100%"
        height="400"
        ref={iframeRef}
        src={CCDA_VIEWER_URL}
        allowFullScreen={true}
        frameBorder={0}
        seamless={true}
        onLoad={() => setShouldSend(true)}
      />
    </div>
  );
}
