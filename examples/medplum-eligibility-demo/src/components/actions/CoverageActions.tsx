import { Stack, Title } from '@mantine/core';
import { Coverage } from '@medplum/fhirtypes';
import { DeleteCoverage } from './DeleteCoverage';
import { EditCoverage } from './EditCoverage';
import { InitiateEligibilityRequest } from './InitiateEligibilityRequest';

interface CoverageActionsProps {
  readonly coverage: Coverage;
  readonly onChange: (updatedCoverage: Coverage) => void;
}

export function CoverageActions(props: CoverageActionsProps): JSX.Element {
  return (
    <Stack>
      <Title>Coverage Actions</Title>
      <Stack>
        <InitiateEligibilityRequest />
        <EditCoverage coverage={props.coverage} onChange={props.onChange} />
        <DeleteCoverage coverage={props.coverage} />
      </Stack>
    </Stack>
  );
}
