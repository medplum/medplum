// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Questionnaire } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../useAppNavigate';

export function QuestionnaireResponsePage(): JSX.Element {
  const { id } = useParams() as { id: string };
  const navigate = useAppNavigate();
  const medplum = useMedplum();

  const questionnaire = medplum.readReference<Questionnaire>({ reference: `Questionnaire/${id}` }).read();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'QuestionnaireResponse',
    filters: [
      {
        code: 'questionnaire',
        operator: Operator.EQUALS,
        value: questionnaire.url ? `${questionnaire.url},Questionnaire/${id}` : `Questionnaire/${id}`,
      },
    ],
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
