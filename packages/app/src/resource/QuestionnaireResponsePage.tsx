import { Operator, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, MemoizedSearchControl, useResource } from '@medplum/react';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function QuestionnaireResponsePage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'QuestionnaireResponse',
    filters: [{ code: 'questionnaire', operator: Operator.EQUALS, value: 'Questionnaire/' + id }],
    fields: ['id', '_lastUpdated'],
  });

  if (!resource) {
    return null;
  }

  return (
    <Document>
      <MemoizedSearchControl
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
        hideToolbar
      />
    </Document>
  );
}
