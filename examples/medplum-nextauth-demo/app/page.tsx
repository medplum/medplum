import { options } from './api/auth/[...nextauth]/options';
import { getServerSession } from 'next-auth/next';
import { MedplumClient } from '@medplum/core';
import { Bundle, Patient } from '@medplum/fhirtypes';
import { PatientTable } from '@/app/components/PatientTable';
import { Container } from '@mantine/core';
import { Suspense } from 'react';

interface Session {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string;
  };
}
const containerProps = {
  bg: 'var(--mantine-color-blue-light)',
  mt: 'md',
};

export default async function Home() {
  const session: Session | null = await getServerSession(options);
  const token = session?.accessToken;
  var bundle: Bundle<Patient> = {
    resourceType: 'Bundle',
    type: 'document',
  };

  try {
    const medplum = new MedplumClient({
      accessToken: token,
    });
    bundle = await medplum.search('Patient');
  } catch (err) {
    console.log(err);
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Container size="xs" {...containerProps}>
        {session ? (
          <PatientTable patients={bundle} />
        ) : (
          <h2>
            Not signed in <a href="/api/auth/signin">Sign in</a>
          </h2>
        )}
      </Container>
    </Suspense>
  );
}
