import { Communication, createReference, Resource } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { parseForm } from './FormUtils';
import { useMedplum } from './MedplumProvider';
import { TextField } from './TextField';
import './ChatControl.css';

export interface ChatControlProps {
  criteria: string;
}

export function ChatControl(props: ChatControlProps) {
  const medplum = useMedplum();

  const sender = medplum.getProfile();
  const senderRef = sender ? createReference(sender) : undefined;

  const [comms, setComms] = useState<Communication[]>([]);
  const commsRef = useRef(comms);
  commsRef.current = comms;

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const result = medplum.subscribe(props.criteria, (resource: Resource) => {
      if (!cancelled) {
        setComms([...commsRef.current, resource as Communication]);
      }
    });
    return () => {
      cancelled = true;
      result.then(eventSource => eventSource.close());
    };
  }, []);

  if (!sender) {
    return null;
  }

  return (
    <div className="medplum-chat">
      <div className="medplum-chat-history">
        {comms.map(comm => {
          if (!comm.payload || comm.payload.length === 0) {
            return null;
          }
          return (
            <div key={comm.id} className="medplum-chat-communication">
              <span className="medplum-chat-bubble">{comm.payload[0].contentString}</span>
            </div>
          );
        })}
      </div>

      <form
        style={{ maxWidth: 400 }}
        onSubmit={(e: React.SyntheticEvent) => {
          e.preventDefault();

          const formData = parseForm(e.target as HTMLFormElement);
          const content = formData.text;

          medplum.create({
            resourceType: 'Communication',
            sender: senderRef,
            payload: [{
              contentString: content
            }]
          });

          const input = inputRef.current;
          if (input) {
            input.value = '';
            input.focus();
          }
        }}>
        <TextField id="text" value="" inputRef={inputRef} />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
