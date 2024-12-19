import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useRef, useState } from 'react';
import { CcdaDisplay } from '../CcdaDisplay/CcdaDisplay';

export interface XmlDisplayProps {
  readonly url?: string;
  readonly maxWidth?: number;
}

export function XmlDisplay(props: XmlDisplayProps): JSX.Element | null {
  const { url } = props;
  const medplum = useMedplum();
  const [xml, setXml] = useState<string>();
  const [xmlIsCcda, setXmlIsCcda] = useState<boolean>();
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    medplum
      .download(url)
      .then((blob) => blob.text().then(setXml))
      .catch(console.error);
  }, [medplum, url]);

  useEffect(() => {
    if (!xml) {
      return;
    }
    // Both of these strings are required to be within a valid C-CDA document
    // "2.16.840.1.113883.10.20.22.2.x" is the ID pattern for various Structure Definitions for C-CDA document elements
    // "urn:hl7-org:v3" is a required namespace to be referenced by all valid C-CDA documents as well
    if (xml.includes('2.16.840.1.113883.10.20.22.2.') && xml.includes('urn:hl7-org:v3')) {
      setXmlIsCcda(true);
    } else {
      setXmlIsCcda(false);
    }
  }, [xml]);

  if (!url) {
    return null;
  }

  return xmlIsCcda ? (
    <CcdaDisplay xml={xml} />
  ) : (
    <div data-testid="xml-display-iframe" style={{ maxWidth: props.maxWidth, minHeight: 400 }}>
      <iframe
        title="XMLDisplay Iframe"
        width="100%"
        height="400"
        ref={iframeRef}
        src={url}
        allowFullScreen={true}
        frameBorder={0}
        seamless={true}
      />
    </div>
  );
}
