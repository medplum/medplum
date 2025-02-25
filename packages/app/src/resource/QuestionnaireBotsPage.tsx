import { Button, Divider, Group, InputLabel, NativeSelect, Stack, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { Bot, Questionnaire, Subscription } from '@medplum/fhirtypes';
import { Document, ResourceInput, ResourceName, useMedplum, useResource } from '@medplum/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

const SUBSCRIPTION_INTERACTION_MAP = {
  'Create Only': 'create',
  'Update Only': 'update',
  'Delete Only': 'delete',
  'All Interactions': undefined,
} as const;

const SUBSCRIPTION_INTERACTION_KEYS = Object.keys(SUBSCRIPTION_INTERACTION_MAP);

type SubscriptionInteractionKey = keyof typeof SUBSCRIPTION_INTERACTION_MAP;

export function QuestionnaireBotsPage(): JSX.Element {
  const medplum = useMedplum();
  const { id } = useParams() as { id: string };
  const questionnaire = useResource<Questionnaire>({ reference: `Questionnaire/${id}` });
  const [connectBot, setConnectBot] = useState<Bot | undefined>();
  const [supportedInteraction, setSupportedInteraction] = useState<'create' | 'update' | 'delete' | undefined>(
    'create'
  );
  const [updated, setUpdated] = useState<number>(0);
  const subscriptions = medplum
    .searchResources('Subscription', 'status=active&_count=100')
    .read()
    .filter((s) => isQuestionnaireBotSubscription(s, questionnaire));

  function connectToBot(): void {
    if (connectBot) {
      if (!questionnaire?.url) {
        console.error('Questionnaire specified does not have a canonical URL');
        return;
      }
      medplum
        .createResource({
          resourceType: 'Subscription',
          status: 'active',
          reason: `Connect bot ${connectBot.name} to questionnaire responses`,
          criteria: `QuestionnaireResponse?questionnaire=${questionnaire?.url}`,
          channel: {
            type: 'rest-hook',
            endpoint: getReferenceString(connectBot),
          },
          ...(supportedInteraction
            ? {
                extension: [
                  {
                    url: 'https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction',
                    valueCode: supportedInteraction,
                  },
                ],
              }
            : undefined),
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
      <Stack>
        {subscriptions.length === 0 && <p>No bots found.</p>}
        {subscriptions.map((subscription) => (
          <div key={subscription.id}>
            <h3>
              <ResourceName value={{ reference: subscription.channel?.endpoint as string }} link={true} />
            </h3>
            <p>Criteria: {subscription.criteria}</p>
          </div>
        ))}
      </Stack>
      <Divider />
      <Stack mt={10}>
        <InputLabel size="lg" htmlFor="bot">
          Connect to bot
        </InputLabel>
        {!questionnaire?.url ? (
          <p>Cannot create new bot subscriptions until a canonical URL is added to the questionnaire.</p>
        ) : (
          <>
            <Group>
              <ResourceInput name="bot" resourceType="Bot" onChange={(r) => setConnectBot(r as Bot)} />
              <Button onClick={connectToBot}>Connect</Button>
            </Group>
            <Group>
              <NativeSelect
                name="subscription-trigger-event"
                defaultValue="Create Only"
                label="Subscription Trigger Event"
                data={SUBSCRIPTION_INTERACTION_KEYS}
                onChange={(event) =>
                  setSupportedInteraction(
                    SUBSCRIPTION_INTERACTION_MAP[event.target.value as SubscriptionInteractionKey]
                  )
                }
              />
            </Group>
          </>
        )}
      </Stack>
      <div style={{ display: 'none' }}>{updated}</div>
    </Document>
  );
}

function isQuestionnaireBotSubscription(subscription: Subscription, questionnaire?: Questionnaire): boolean {
  if (!questionnaire) {
    return false;
  }
  const criteria = subscription.criteria || '';
  const endpoint = subscription.channel?.endpoint || '';
  return (
    criteria.startsWith('QuestionnaireResponse?') &&
    criteria.includes(questionnaire?.url ?? 'INVALID') &&
    endpoint.startsWith('Bot/')
  );
}
