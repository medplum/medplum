import { Blockquote, Stack } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { Loading, NoteDisplay, useSearchResources } from '@medplum/react';

interface ClinicalImpressionDisplayProps {
  readonly patient: Patient;
}

export function ClinicalImpressionDisplay(props: ClinicalImpressionDisplayProps): JSX.Element {
  const [impressions] = useSearchResources('ClinicalImpression', { patient: getReferenceString(props.patient) });

  if (!impressions) {
    return <Loading />;
  }

  if (impressions.length === 0) {
    return <Blockquote color="dark">No Notes</Blockquote>;
  }

  return (
    <Stack>
      {impressions.map((impression, idx) => (
        <NoteDisplay key={idx} value={impression.note} />
      ))}
    </Stack>
  );
}
