// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Questionnaire } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ErrorBoundary, Loading, MedplumProvider } from '@medplum/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import { QuestionnairePreview } from './QuestionnairePreview';

const medplum = new MockClient();

describe('QuestionnairePreview', () => {
  async function setup(questionnaire: Questionnaire): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter>
            <MantineProvider>
              <Notifications />
              <ErrorBoundary>
                <Suspense fallback={<Loading />}>
                  <QuestionnairePreview resourceType="Questionnaire" id={questionnaire.id as string} />
                </Suspense>
              </ErrorBoundary>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Renders preview alert', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      title: 'Test Questionnaire',
    });

    await setup(questionnaire);

    expect(await screen.findByText(/^This is just a preview!/)).toBeInTheDocument();
    expect(screen.getByText(`/forms/${questionnaire.id}`)).toBeInTheDocument();
  });

  test('Renders QuestionnaireForm', async () => {
    const questionnaire = await medplum.createResource<Questionnaire>({
      resourceType: 'Questionnaire',
      status: 'active',
      title: 'Test Questionnaire',
      item: [
        {
          linkId: 'q1',
          type: 'string',
          text: 'Question 1',
        },
      ],
    });

    await setup(questionnaire);

    expect(await screen.findByText('Question 1')).toBeInTheDocument();
  });
});

