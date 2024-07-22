import { AppShell, ErrorBoundary, Loading, Logo, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconDatabaseImport, IconFilePencil, IconHealthRecognition, IconRobot, IconUser } from '@tabler/icons-react';
import { Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
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
import { Questionnaire } from '@medplum/fhirtypes';

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
            { icon: <IconDatabaseImport />, label: 'Upload Core Data', href: '/upload/core' },
            { icon: <IconHealthRecognition />, label: 'Upload Example Patient Data', href: '/upload/example' },
            { icon: <IconRobot />, label: 'Upload Example Bots', href: '/upload/bots' },
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
              <Route path="/Patient/:id/*" element={<PatientPage />} />
              <Route path="/Patient/:patientId/intake" element={<IntakeFormPage />} />
              <Route path="/Patient/:patientId/intake/:responseId" element={<IntakeResponsePage />} />
              <Route path="/:resourceType/:id/*" element={<ResourcePage />} />
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
