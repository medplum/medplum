import { Document, ResourceForm } from 'medplum-ui';
import React from 'react';
import { useParams } from 'react-router-dom';
import './ResourcePage.css';

export function ResourcePage() {
  const { resourceType, id } = useParams() as any;
  return (
    <Document>
      <ResourceForm resourceType={resourceType} id={id} />
    </Document>
  );
}
