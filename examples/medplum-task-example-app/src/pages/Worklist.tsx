import { Filter, getReferenceString, Operator } from '@medplum/core';
import { Resource, Task } from '@medplum/fhirtypes';
import { SearchControl, useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Worklist(): JSX.Element {
  const profile = useMedplumProfile() as Resource;
  const navigate = useNavigate();

  return (
    <div>
      <SearchControl
        search={{
          resourceType: 'Task',
          filters: [{ code: 'owner', operator: Operator.EQUALS, value: `${getReferenceString(profile)}` }],
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar={true}
      />
    </div>
  );
}
