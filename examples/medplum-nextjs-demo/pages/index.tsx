import { Button, Title } from '@mantine/core';
import { Container, QuestionnaireForm, ResourceTable, SignInForm, useMedplum, useMedplumProfile, Document } from '@medplum/react';

// Medplum can autodetect Google Client ID from origin, but only if using window.location.host.
// Because window.location.host is not available on the server, we must use a constant value.
// This is a pre-defined Google Client ID for localhost:3000.
// You will need to register your own Google Client ID for your own domain.
const googleClientId = '921088377005-3j1sa10vr6hj86jgmdfh2l53v3mp7lfi.apps.googleusercontent.com';

export default function IndexPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  return (
    <Container mt="xl">
      <Title order={1} my="xl">
        Welcome to Medplum &amp; Next.js!
      </Title>
      {!profile && <SignInForm googleClientId={googleClientId}>Sign in</SignInForm>}
      {profile && (
        <>
          <Title order={3} my="xl">
            Profile
          </Title>
          <ResourceTable value={profile} ignoreMissingValues />
          <Button onClick={() => medplum.signOut()}>Sign out</Button>
        </>
      )}
      <Document>
        <QuestionnaireForm
          questionnaire={{
            resourceType: 'Questionnaire',
            name: 'New User profile completion',
            title: 'Patient Intake Form',
            status: 'active',
            subjectType: ['Patient'],
            date: '2023-04-20T14:49:00.000Z',
            publisher: 'Eamon',
            purpose:
              "When a new patient resource is created, the only information we automatically collect from the register form is the user's name, and email. The purpose of this form is to gather basic information about the patient in order to complete their profile",
            id: 'f8a05c5a-0076-41fc-a73e-4b0771aa14e0',
            meta: {
              versionId: '844f44dd-7527-4101-9f88-06190cccb306',
              lastUpdated: '2023-05-07T21:10:07.190Z',
              author: {
                reference: 'Practitioner/d2ef90d9-ca42-4583-a0fb-b10fb9a3e978',
                display: 'Team Hilo',
              },
              project: 'b0aa142c-85e2-4fb3-a62c-fe949a0b0573',
              compartment: [{ reference: 'Project/b0aa142c-85e2-4fb3-a62c-fe949a0b0573' }],
            },
            item: [
              {
                id: 'id-19',
                linkId: 'g15',
                type: 'group',
                text: 'We Need some more info to complete your profile',
                item: [
                  {
                    id: 'id-22',
                    linkId: 'q3',
                    type: 'choice',
                    text: 'Gender at birth',
                    answerOption: [
                      { id: 'id-23', valueString: 'Male' },
                      { id: 'id-24', valueString: 'Female' },
                      { id: 'id-25', valueString: 'Other' },
                    ],
                  },
                  { id: 'id-26', linkId: 'q4', type: 'date', text: 'Birthdate' },
                  {
                    id: 'id-27',
                    linkId: 'q5',
                    type: 'attachment',
                    text: 'Profile Picture',
                  },
                  { id: 'id-28', linkId: 'q6', type: 'reference', text: 'Address' },
                ],
              },
            ],
          }}
          onSubmit={(response) => console.log(response)}
        />
      </Document>
    </Container>
  );
}
