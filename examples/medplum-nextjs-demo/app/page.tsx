'use client';

import { Button, Title } from '@mantine/core';
import { Container, ResourceTable, SignInForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { Metadata } from 'next';

// Medplum can autodetect Google Client ID from origin, but only if using window.location.host.
// Because window.location.host is not available on the server, we must use a constant value.
// This is a pre-defined Google Client ID for localhost:3000.
// You will need to register your own Google Client ID for your own domain.
const googleClientId = '921088377005-3j1sa10vr6hj86jgmdfh2l53v3mp7lfi.apps.googleusercontent.com';

export const metaData: Metadata = {
  title: 'Page Title',
  favicon: '/favicon.svg',
  viewport: 'minimum-scale=1, initial-scale=1, width=device-width',
};

export default function Page(): JSX.Element {
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
    </Container>
  );
}
