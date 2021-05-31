import { Resource } from '@medplum/core';
import { Document, ResourceForm, useMedplum } from '@medplum/ui';
import React from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';
import './ResourcePage.css';

export function CreateResourcePage() {
  const { resourceType } = useParams() as any;
  const medplum = useMedplum();

  return (
    <>
      <div style={{
        backgroundColor: 'white',
        borderBottom: '2px solid #eee',
        color: '#444',
        fontWeight: 'bold',
        padding: '15px 30px',
      }}>
        New&nbsp;{resourceType}
      </div>
      <Document>
        <ResourceForm
          resource={{ resourceType }}
          onSubmit={(formData: Resource) => {
            medplum.create(formData)
              .then(result => history.push('/' + result.resourceType + '/' + result.id));
          }}
        />
      </Document>
    </>
  );
}
