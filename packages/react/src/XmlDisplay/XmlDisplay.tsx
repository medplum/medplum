import { Center } from '@mantine/core';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useRef, useState } from 'react';
import { CcdaDisplay } from '../CcdaDisplay/CcdaDisplay';
import { Document } from '../Document/Document';
import { Loading } from '../Loading/Loading';

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
    // The root element in a CDA document should be a "ClinicalDocument"
    // "urn:hl7-org:v3" is a required namespace to be referenced by all valid C-CDA documents as well
    if (xml.includes('<ClinicalDocument') && xml.includes('xmlns="urn:hl7-org:v3"')) {
      setXmlIsCcda(true);
    } else {
      setXmlIsCcda(false);
    }
  }, [xml]);

  if (!url) {
    return null;
  }

  if (!xml) {
    return (
      <Document>
        <Center>
          <Loading />
        </Center>
      </Document>
    );
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
