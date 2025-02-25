import { Operator, SearchRequest } from '@medplum/core';
import { Questionnaire } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function QuestionnaireResponsePage(): JSX.Element {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const medplum = useMedplum();

  const questionnaire = medplum.readReference<Questionnaire>({ reference: `Questionnaire/${id}` }).read();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'QuestionnaireResponse',
    filters: [{ code: 'questionnaire', operator: Operator.EQUALS, value: questionnaire?.url ?? 'INVALID' }],
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
