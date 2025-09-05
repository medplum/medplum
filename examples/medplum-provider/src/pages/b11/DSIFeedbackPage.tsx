// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, Title } from '@mantine/core';
import { SearchRequest, MedplumClient, convertToTransactionBundle, formatSearchQuery, Operator } from '@medplum/core';
import { Document, exportJsonFile, SearchControl, useMedplum, useSearchResources } from '@medplum/react';
import { JSX, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Bundle, ResourceType } from '@medplum/fhirtypes';
import { showErrorNotification } from '../../utils/notifications';

export function DSIFeedbackPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();

  // Find DSI feedback questionnaires by searching for questionnaires with "dsi-feedback" in name
  const [dsiQuestionnaires] = useSearchResources('Questionnaire', {
    'name:contains': 'dsi-feedback',
  });

  // Create search request for QuestionnaireResponse resources
  const search: SearchRequest = useMemo(() => {
    return {
      resourceType: 'QuestionnaireResponse',
      fields: ['_lastUpdated', 'status', 'questionnaire', 'authored', 'source'],
      filters: [
        {
          code: 'questionnaire',
          operator: Operator.IN,
          value: dsiQuestionnaires?.map((q) => `Questionnaire/${q.id}`).join(',') ?? '',
        },
      ],
      include: [
        {
          resourceType: 'QuestionnaireResponse',
          searchParam: 'questionnaire',
          targetType: 'Questionnaire',
          modifier: 'iterate',
        },
      ],
      // TODO: Change to authored
      sortRules: [{ code: '_lastUpdated', descending: true }],
    };
  }, [dsiQuestionnaires]);

  return (
    <Document>
      <Stack gap="md">
        <Title order={1}>Decision Support Interventions Feedback</Title>
        <Text>Export user feedback responses for Decision Support Interventions.</Text>

        <SearchControl
          search={search}
          onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
          onAuxClick={(e) => window.open(`/${e.resource.resourceType}/${e.resource.id}`, '_blank')}
          onExportTransactionBundle={async () => {
            getTransactionBundle(search, medplum)
              .then((bundle) => exportJsonFile(JSON.stringify(bundle, undefined, 2), 'dsi-feedback'))
              .catch((err) => showErrorNotification(err));
          }}
          hideFilters
        />
      </Stack>
    </Document>
  );
}

async function getTransactionBundle(search: SearchRequest, medplum: MedplumClient): Promise<Bundle> {
  const transactionBundleSearch: SearchRequest = {
    ...search,
    count: 1000,
    offset: 0,
  };
  const bundle = await medplum.search(
    transactionBundleSearch.resourceType as ResourceType,
    formatSearchQuery({ ...transactionBundleSearch, total: 'accurate', fields: undefined })
  );
  return convertToTransactionBundle(bundle);
}
