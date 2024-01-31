import { Button, Input, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ContentType } from '@medplum/core';
import { Agent, Reference } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconRouter } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

export function ToolsPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const reference = useMemo(() => ({ reference: 'Agent/' + id }) as Reference<Agent>, [id]);
  const [ip, setIp] = useState('');
  const [lastPing, setLastPing] = useState<string | undefined>();
  const [pinging, setPinging] = useState(false);

  const ipRef = useRef(ip);
  ipRef.current = ip;

  const onSubmit = useCallback(() => {
    if (ipRef.current === '') {
      return;
    }
    setPinging(true);
    medplum
      .pushToAgent(reference, ipRef.current, 'PING', ContentType.PING, true)
      .then((pingResult: string) => {
        setLastPing(pingResult);
        setPinging(false);
      })
      .catch((err) => {
        setPinging(false);
        if ((err as Error).message === 'Destination device not found') {
          // Report error
          showNotification({
            color: 'red',
            message: 'Error: Destination device not found or IP invalid',
          });
        }
      });
  }, [medplum, reference]);

  return (
    <Document>
      <Title>Ping from Agent</Title>
      <Form onSubmit={onSubmit}>
        <Input.Wrapper label="IP">
          <Input name="ip" onChange={(e) => setIp(e.target.value)} value={ip} />
        </Input.Wrapper>
      </Form>
      <Button
        mt={10}
        mb={20}
        type="button"
        onClick={onSubmit}
        loading={pinging}
        leftSection={<IconRouter size="1rem" />}
      >
        Ping
      </Button>
      {!pinging && lastPing && (
        <>
          <Title order={5}>Last Ping</Title>
          <pre>{lastPing}</pre>
        </>
      )}
    </Document>
  );
}
