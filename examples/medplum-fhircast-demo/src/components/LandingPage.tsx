import { Button, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export default function LandingPage(): JSX.Element {
  return (
    <div>
      <Title>Welcome to the Medplum FHIRcast Example!</Title>
      <Button component={Link} to="/signin" size="lg" radius="xl">
        Sign in
      </Button>
    </div>
  );
}
