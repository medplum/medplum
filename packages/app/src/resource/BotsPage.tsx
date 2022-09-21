import { Button, Group } from '@mantine/core';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bot, Resource, Subscription } from '@medplum/fhirtypes';
import { ResourceInput, ResourceName, useMedplum } from '@medplum/react';
import React, { useState } from 'react';
import { toast } from 'react-toastify';

export interface BotsPageProps {
  resource: Resource;
}

export function BotsPage(props: BotsPageProps): JSX.Element {
  const medplum = useMedplum();
  const [connectBot, setConnectBot] = useState<Resource | undefined>();
  const [updated, setUpdated] = useState<number>(0);
  const subscriptions = medplum
    .searchResources('Subscription', 'status=active&_count=100')
    .read()
    .filter((s) => isQuestionnaireBotSubscription(s, props.resource));

  function connectToBot(): void {
    if (connectBot) {
      medplum
        .createResource({
          resourceType: 'Subscription',
          status: 'active',
          reason: (connectBot as Bot).name,
          criteria: 'QuestionnaireResponse?questionnaire=' + getReferenceString(props.resource),
          channel: {
            type: 'rest-hook',
            endpoint: getReferenceString(connectBot),
          },
        })
        .then(() => {
          setConnectBot(undefined);
          setUpdated(Date.now());
          medplum.invalidateSearches('Subscription');
          toast.success('Success');
        })
        .catch((err) => toast.error(normalizeErrorString(err)));
    }
  }

  return (
    <div>
      <h1>Bots</h1>
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
      <h1>Connect to bot</h1>
      <Group>
        <ResourceInput name="bot" resourceType="Bot" onChange={setConnectBot} />
        <Button onClick={connectToBot}>Connect</Button>
      </Group>
      <div style={{ display: 'none' }}>{updated}</div>
    </div>
  );
}

function isQuestionnaireBotSubscription(subscription: Subscription, resource: Resource): boolean {
  const criteria = subscription.criteria || '';
  const endpoint = subscription.channel?.endpoint || '';
  return (
    criteria.startsWith('QuestionnaireResponse?') &&
    criteria.includes(resource.id as string) &&
    endpoint.startsWith('Bot/')
  );
}
