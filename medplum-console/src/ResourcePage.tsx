import { Document, useMedplum } from 'medplum-ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function ResourcePage() {
  const { resourceType, id } = useParams() as any;
  const medplum = useMedplum();
  const [resource, setResource] = useState({});

  useEffect(() => {
    medplum.read(resourceType, id)
      .then(data => setResource(data));
  }, [resourceType, id]);

  return (
    <Document>
      <pre>{JSON.stringify(resource, undefined, 2)}</pre>
    </Document>
  );
}
