import { Anchor, Box, Button, Modal, Stack, Text, Title } from '@mantine/core';
import { formatDateTime, formatHumanName, formatTiming } from '@medplum/core';
import { HumanName, MedicationRequest } from '@medplum/fhirtypes';
import { ResourceTable, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { InfoSection } from '../../components/InfoSection';

export function Medication(): JSX.Element {
  const medplum = useMedplum();
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const { medicationId = '' } = useParams();
  const med: MedicationRequest = medplum.readResource('MedicationRequest', medicationId).read();

  return (
    <Box p="xl">
      <Title order={2}>{med.medicationCodeableConcept?.text}</Title>
      <p className="mb-6 text-lg text-gray-600">To refill this medication, please contact your pharmacy.</p>
      <p className="mb-6 text-lg text-gray-600">
        No more refills available at your pharmacy?{' '}
        <Anchor onClick={() => setModalOpen(true)}>Renew your prescription</Anchor>
      </p>
      <InfoSection title="Medication">
        <ResourceTable value={med} ignoreMissingValues />
      </InfoSection>
      <RenewalModal prev={med} opened={modalOpen} setOpened={setModalOpen} />
    </Box>
  );
}

function RenewalModal({
  prev,
  opened,
  setOpened,
}: {
  readonly prev: MedicationRequest;
  readonly opened: boolean;
  readonly setOpened: (o: boolean) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile();
  return (
    <Modal
      size="lg"
      opened={opened}
      onClose={() => setOpened(false)}
      title={<Title order={3}>Request a Renewal</Title>}
    >
      <Stack gap="md">
        <KeyValue name="Patient" value={formatHumanName(patient?.name?.[0] as HumanName)} />
        <KeyValue name="Last Prescribed" value={formatDateTime(prev.authoredOn)} />
        <KeyValue name="Status" value={prev.status} />
        <KeyValue name="Medication" value={prev.medicationCodeableConcept?.text} />
        <KeyValue
          name="Dosage Instructions"
          value={prev.dosageInstruction?.[0]?.timing && formatTiming(prev.dosageInstruction[0].timing)}
        />
        <Button onClick={() => setOpened(false)}>Submit Renewal Request</Button>
      </Stack>
    </Modal>
  );
}

function KeyValue({ name, value }: { name: string; value: string | undefined }): JSX.Element {
  return (
    <div>
      <Text size="xs" color="gray" tt="uppercase">
        {name}
      </Text>
      <Text size="lg" fw={500}>
        {value}
      </Text>
    </div>
  );
}
