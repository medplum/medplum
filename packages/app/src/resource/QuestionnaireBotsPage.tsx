import { Button, Group, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bot, Subscription } from '@medplum/fhirtypes';
import { Document, ResourceInput, ResourceName, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

export function QuestionnaireBotsPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const [connectBot, setConnectBot] = useState<Bot | undefined>();
  const [updated, setUpdated] = useState<number>(0);
  const subscriptions = medplum
    .searchResources('Subscription', 'status=active&_count=100')
    .read()
    .filter((s) => isQuestionnaireBotSubscription(s, id));

  function connectToBot(): void {
    if (connectBot) {
      medplum
        .createResource({
          resourceType: 'Subscription',
          status: 'active',
          reason: `Connect bot ${connectBot.name} to questionnaire responses`,
          criteria: 'QuestionnaireResponse?questionnaire=Questionnaire/' + id,
          channel: {
            type: 'rest-hook',
            endpoint: getReferenceString(connectBot),
          },
        })
        .then(() => {
          setConnectBot(undefined);
          setUpdated(Date.now());
          medplum.invalidateSearches('Subscription');
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
    }
  }

  return (
    <Document>
      <Title>Bots</Title>
      {subscriptions.length === 0 && <p>No bots found.</p>}
      {subscriptions.map((subscription) => (
        <div key={subscription.id}>
          <h3>
            <ResourceName value={{ reference: subscription.channel?.endpoint as string }} link={true} />
          </h3>
          <p>Criteria: {subscription.criteria}</p>
        </div>
      ))}
      <hr />
      <Title>Connect to bot</Title>
      <Group>
        <ResourceInput name="bot" resourceType="Bot" onChange={(r) => setConnectBot(r as Bot)} />
        <Button onClick={connectToBot}>Connect</Button>
      </Group>
      <div style={{ display: 'none' }}>{updated}</div>
    </Document>
  );
}

function isQuestionnaireBotSubscription(subscription: Subscription, questionnaireId: string): boolean {
  const criteria = subscription.criteria || '';
  const endpoint = subscription.channel?.endpoint || '';
  return (
    criteria.startsWith('QuestionnaireResponse?') && criteria.includes(questionnaireId) && endpoint.startsWith('Bot/')
  );
}
