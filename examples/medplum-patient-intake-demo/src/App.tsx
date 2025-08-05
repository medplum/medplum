// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Questionnaire } from '@medplum/fhirtypes';
import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import {
  IconDatabaseImport,
  IconFilePencil,
  IconHealthRecognition,
  IconPencil,
  IconQuestionMark,
  IconRobot,
  IconUser,
} from '@tabler/icons-react';
import { JSX, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import { IntakeFormPage } from './pages/IntakeFormPage';
import { IntakeResponsePage } from './pages/IntakeResponsePage';
import { LandingPage } from './pages/LandingPage';
import { PatientPage } from './pages/PatientPage';
import { QuestionnaireCustomizationPage } from './pages/QuestionnaireCustomizationPage';
import { ResourcePage } from './pages/ResourcePage';
import { SearchPage } from './pages/SearchPage';
import { SignInPage } from './pages/SignInPage';
import { UploadDataPage } from './pages/UploadDataPage';
import { IntakeQuestionnaireContext } from './Questionnaire.context';

export function App(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [intakeQuestionnaire, setIntakeQuestionnaire] = useState<Questionnaire | undefined>(undefined);

  useEffect(() => {
    if (medplum.isLoading() || !profile) {
      return;
    }

    medplum
      .searchOne('Questionnaire', { name: 'patient-intake' })
      .then((intakeQuestionnaire) => {
        setIntakeQuestionnaire(intakeQuestionnaire);
      })
      .catch((err) => {
        console.log(err);
      });
  }, [medplum, profile]);

  if (medplum.isLoading()) {
    return null;
  }

  return (
    <AppShell
      logo={<Logo size={24} />}
      menus={[
        {
          title: 'Charts',
          links: [{ icon: <IconUser />, label: 'Patients', href: '/Patient' }],
        },
        {
          title: 'Onboarding',
          links: [{ icon: <IconPencil />, label: 'New Patient', href: '/onboarding' }],
        },
        intakeQuestionnaire
          ? {
              title: 'Management',
              links: [
                {
                  icon: <IconFilePencil />,
                  label: 'Customize intake form',
                  href: `/Questionnaire/${intakeQuestionnaire.id}/edit`,
                },
              ],
            }
          : {},
        {
          title: 'Upload Data',
          links: [
            { icon: <IconDatabaseImport />, label: 'Upload Core ValueSets', href: '/upload/core' },
            { icon: <IconQuestionMark />, label: 'Upload Questionnaires', href: '/upload/questionnaire' },
            { icon: <IconRobot />, label: 'Upload Example Bots', href: '/upload/bots' },
            { icon: <IconHealthRecognition />, label: 'Upload Example Data', href: '/upload/example' },
          ],
        },
      ]}
    >
      <IntakeQuestionnaireContext.Provider value={{ questionnaire: intakeQuestionnaire }}>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={profile ? <SearchPage /> : <LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/Patient/:id">
                <Route index element={<PatientPage />} />
                <Route path="*" element={<PatientPage />} />
              </Route>
              <Route path="/Patient/:patientId/intake/:responseId" element={<IntakeResponsePage />} />
              <Route path="/onboarding" element={<IntakeFormPage />} />
              <Route path="/:resourceType/:id">
                <Route index element={<ResourcePage />} />
                <Route path="*" element={<ResourcePage />} />
              </Route>
              <Route path="/:resourceType" element={<SearchPage />} />
              <Route path="/upload/:dataType" element={<UploadDataPage />} />
              <Route path="/Questionnaire/:questionnaireId/edit" element={<QuestionnaireCustomizationPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </IntakeQuestionnaireContext.Provider>
    </AppShell>
  );
}
