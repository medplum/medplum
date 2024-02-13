import { Button, Stack, Title } from '@mantine/core';
import { DeleteCoverage } from './DeleteCoverage';
import { EditCoverage } from './EditCoverage';
import { InitiateEligibilityRequest } from './InitiateEligibilityRequest';

export function CoverageActions(): JSX.Element {
  return (
    <Stack>
      <Title>Coverage Actions</Title>
      <Stack>
        <InitiateEligibilityRequest />
        <EditCoverage />
        <DeleteCoverage />
      </Stack>
    </Stack>
  );
}
