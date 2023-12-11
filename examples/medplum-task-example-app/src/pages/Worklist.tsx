import { getReferenceString, Operator } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplumProfile } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

export function Worklist(): JSX.Element {
  const profile = useMedplumProfile() as Resource;
  const navigate = useNavigate();

  return (
    <Document>
      <SearchControl
        search={{
          resourceType: 'Task',
          filters: [{ code: 'owner', operator: Operator.EQUALS, value: `${getReferenceString(profile)}` }],
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar={true}
      />
    </Document>
  );
}
