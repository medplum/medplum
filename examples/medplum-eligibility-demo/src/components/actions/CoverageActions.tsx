import { Stack, Title } from '@mantine/core';
import { Coverage } from '@medplum/fhirtypes';
import { DeleteCoverage } from './DeleteCoverage';
import { EditCoverage } from './EditCoverage';
import { InitiateEligibilityRequest } from './InitiateEligibilityRequest';

interface CoverageActionsProps {
  readonly coverage: Coverage;
  readonly onCoverageChange: (updatedCoverage: Coverage) => void;
  readonly onEligibilityChange: (coverage: Coverage) => void;
}

export function CoverageActions(props: CoverageActionsProps): JSX.Element {
  return (
    <Stack>
      <Title>Coverage Actions</Title>
      <InitiateEligibilityRequest coverage={props.coverage} onSubmit={props.onEligibilityChange} />
      <EditCoverage coverage={props.coverage} onChange={props.onCoverageChange} />
      <DeleteCoverage coverage={props.coverage} />
    </Stack>
  );
}
