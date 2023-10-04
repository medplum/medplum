import { useMedplum } from '@medplum/react';
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
    <div>
      <div style={{ paddingBottom: 30 }}>
        <h1>Publisher</h1>
      </div>
      <div style={{ padding: 5 }}>
        <TopicGenerator onTopicChange={(topic) => setTopic(topic)} />
      </div>
      <div style={{ padding: 5 }}>Patient ID: {currentPatientId ?? 'No current patient'}</div>
      <div style={{ padding: 5 }}>
        <button type="button" onClick={handleChangePatient}>
          Change patient
        </button>
      </div>
    </div>
  );
}
