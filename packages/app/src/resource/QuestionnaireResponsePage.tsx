import { Operator, SearchRequest } from '@medplum/core';
import { Document, SearchControl } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function QuestionnaireResponsePage(): JSX.Element | null {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'QuestionnaireResponse',
    filters: [{ code: 'questionnaire', operator: Operator.EQUALS, value: 'Questionnaire/' + id }],
    fields: ['id', '_lastUpdated'],
  });

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
        hideToolbar
      />
    </Document>
  );
}
