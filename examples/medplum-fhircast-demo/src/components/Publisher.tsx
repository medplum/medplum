import { useState } from 'react';
import { BASE_URL } from '../config';
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
  const [baseUrl, setBaseUrl] = useState(BASE_URL);
  const [baseUrlInput, setBaseUrlInput] = useState(BASE_URL);
  const [topic, setTopic] = useState<string | undefined>(undefined);
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);

  const handleChangePatient = (): void => {
    const patientId = crypto.randomUUID();
    if (topic) {
      fetch(`${baseUrl}/fhircast/STU2/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createFhircastMessagePayload(topic, patientId)),
      })
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
      <div
        style={{
          padding: 10,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: 300,
          justifyContent: 'center',
          paddingBottom: 20,
        }}
      >
        <input name="baseUrl" type="text" value={baseUrlInput} onChange={(e) => setBaseUrlInput(e.target.value)} />
        <div style={{ padding: 10 }}>
          <button type="button" onClick={() => setBaseUrl(baseUrlInput)}>
            Set base URL
          </button>
        </div>
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
