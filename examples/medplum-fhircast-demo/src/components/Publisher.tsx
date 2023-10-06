import { Button, Input, Stack, Title } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { FhircastMessagePayload } from '../utils';
import TopicGenerator from './TopicGenerator';

function createFhircastMessagePayload(topic: string, patientId: string): FhircastMessagePayload {
  if (!topic) {
    throw new Error('Must provide a topic!');
  }
  return {
    timestamp: new Date().toISOString(),
    id: crypto.randomUUID(),
    event: {
      'hub.topic': topic,
      'hub.event': 'patient-open', // TODO: Hardcoded for now
      context: [
        {
          key: 'patient',
          resource: {
            resourceType: 'Patient',
            id: patientId,
            identifier: [
              {
                type: {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                      code: 'MR',
                      display: 'Medical Record Number',
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

export default function Publisher(): JSX.Element {
  const medplum = useMedplum();
  const [topic, setTopic] = useState<string | undefined>(undefined);
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);

  const handleChangePatient = (): void => {
    const patientId = crypto.randomUUID();
    if (topic) {
      medplum
        .post(`/fhircast/STU2/${topic}`, createFhircastMessagePayload(topic, patientId))
        .then(() => {
          setCurrentPatientId(patientId);
        })
        .catch((err) => console.error(err));
    } else {
      setCurrentPatientId(patientId);
    }
  };

  return (
    <Document>
      <Title align="center" fz={36}>
        Publisher
      </Title>
      <Stack align="center">
        <div style={{ height: 150 }}>
          <TopicGenerator onTopicChange={(topic) => setTopic(topic)} />
        </div>
        <Input.Wrapper label="Patient ID" mb={20} w={350}>
          <Input value={currentPatientId ?? 'No current patient'} disabled={!currentPatientId} />
        </Input.Wrapper>
        <Button onClick={handleChangePatient} size="sm" radius="xl">
          Change patient
        </Button>
      </Stack>
    </Document>
  );
}
