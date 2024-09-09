import { ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceBlame, useMedplum } from '@medplum/react';
import { useParams } from 'react-router-dom';

export function BlamePage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const history = medplum.readHistory(resourceType, id).read();

  return (
    <Document>
      <ResourceBlame history={history} />
    </Document>
  );
}
