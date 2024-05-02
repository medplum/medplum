import { Blockquote, Stack } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { ClinicalImpression, Patient } from '@medplum/fhirtypes';
import { Loading, NoteDisplay, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';

interface ClinicalImpressionDisplayProps {
  readonly patient: Patient;
}

export function ClinicalImpressionDisplay(props: ClinicalImpressionDisplayProps): JSX.Element {
  const medplum = useMedplum();
  const [impressions, setImpressions] = useState<ClinicalImpression[]>();

  useEffect(() => {
    // Get the clinical impressions containing encounter notes
    const fetchClinicalImpressions = async (): Promise<void> => {
      try {
        const clinicalImpressions = await medplum.searchResources('ClinicalImpression', {
          patient: getReferenceString(props.patient),
        });
        setImpressions(clinicalImpressions);
      } catch (err) {
        console.error(err);
      }
    };

    fetchClinicalImpressions().catch(console.error);
  }, [medplum, props.patient]);

  if (!impressions) {
    return <Loading />;
  }

  if (impressions.length === 0) {
    return <Blockquote color="dark">No Notes</Blockquote>;
  }

  return (
    <Stack>
      {impressions.map((impression) => (
        <NoteDisplay value={impression.note} />
      ))}
    </Stack>
  );
}
