import { useEffect, useState } from 'react';
import { usePrevious } from '../hooks';
import { FHIRcastMessagePayload } from '../utils';
import TopicGenerator from './TopicGenerator';

type PACSProps = {
  hubPort: number;
};

function createFHIRcastMessagePayload(topic: string, patientId: string): FHIRcastMessagePayload {
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
                      value: 'MR',
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

export default function PACS(props: PACSProps): JSX.Element {
  const { hubPort } = props;

  const [driving, setDriving] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
  const prevTopic = usePrevious(topic);

  useEffect(() => {
    // if had prev topic, and now we don't, setDriving false
    // if didn't have and now we do, setDriving true
    if (typeof prevTopic !== typeof topic) {
      setDriving(!!topic);
    }
  }, [prevTopic, topic]);

  const handleChangePatient = (): void => {
    if (!topic) {
      return;
    }
    const patientId = crypto.randomUUID();
    const stringifiedBody = JSON.stringify(createFHIRcastMessagePayload(topic, patientId));
    if (driving && topic) {
      fetch(`http://localhost:${hubPort}/hub/${topic}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': stringifiedBody.length.toString(),
        },
        body: stringifiedBody,
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
        <h1>Driver</h1>
      </div>
      <div style={{ padding: 5 }}>
        <TopicGenerator onTopicChange={(topic) => setTopic(topic)} />
      </div>
      <>
        <div style={{ padding: 5 }}>Patient ID: {currentPatientId ?? 'No current patient'}</div>
        <div style={{ padding: 5 }}>
          <button type="button" onClick={handleChangePatient}>
            Change patient
          </button>
        </div>
      </>
    </div>
  );
}
