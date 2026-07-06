// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BackgroundImage, Box, SimpleGrid } from '@mantine/core';
import { RegisterForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <SimpleGrid cols={2}>
      <Box pt={100} pb={200}>
        <RegisterForm
          type="patient"
          projectId={import.meta.env.MEDPLUM_PROJECT_ID}
          googleClientId={import.meta.env.GOOGLE_CLIENT_ID}
          clientId={import.meta.env.MEDPLUM_CLIENT_ID}
          recaptchaSiteKey={import.meta.env.RECAPTCHA_SITE_KEY}
          onSuccess={() => navigate('/')?.catch(console.error)}
        >
          <h2>Register with Foo Medical</h2>
        </RegisterForm>
      </Box>
      <BackgroundImage src="https://images.unsplash.com/photo-1556761175-4b46a572b786?ixlib=rb-1.2.1&amp;ixid=eyJhcHBfaWQiOjEyMDd9&amp;auto=format&amp;fit=crop&amp;w=1567&amp;q=80" />
    </SimpleGrid>
  );
}
