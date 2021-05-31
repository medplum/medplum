import { Resource } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { Button } from './Button';
import { Document } from './Document';
import { parseForm } from './FormUtils';
import { useMedplum } from './MedplumProvider';
import { TextField } from './TextField';

export function SseListener() {
  const medplum = useMedplum();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<Resource[]>([]);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  return (
    <Document>
      {connected ? (
        <div style={{ border: '1px solid black', width: 600, height: 400 }}>
          <pre>{JSON.stringify(events, undefined, 2)}</pre>
        </div>
      ) : (
        <form
          style={{ maxWidth: 400 }}
          onSubmit={(e: React.SyntheticEvent) => {
            e.preventDefault();
            setEvents([]);

            const formData = parseForm(e.target as HTMLFormElement);
            medplum.subscribe(formData.criteria, (resource: Resource) => {
              setEvents([...eventsRef.current, resource]);
            });
            setConnected(true);

          }}>
          <TextField id="criteria" value="Patient" />
          <Button type="submit">Go</Button>
        </form>
      )}
    </Document>
  );
}
