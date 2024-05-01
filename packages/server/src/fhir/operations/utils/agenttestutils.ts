import { BaseAgentMessage, BaseAgentRequestMessage, getReferenceString } from '@medplum/core';
import {
  Agent,
  Bundle,
  BundleEntry,
  OperationOutcome,
  OperationOutcomeIssue,
  Parameters,
  ParametersParameter,
} from '@medplum/fhirtypes';
import { Redis } from 'ioredis';
import { getRedis, getRedisSubscriber } from '../../../redis';

const subscribers = new Set<Redis>();

export function cleanupAllAgentMessageSubscribers(): void {
  for (const subscriber of subscribers) {
    subscriber.disconnect();
    subscribers.delete(subscriber);
  }
}

export interface MockAgentResponseHandle {
  cleanup(): void;
}

export async function mockAgentResponse<
  TRequest extends BaseAgentRequestMessage = BaseAgentRequestMessage,
  TResponse extends BaseAgentMessage = BaseAgentMessage,
>(agent: Agent, msgType: TRequest['type'], res: TResponse): Promise<MockAgentResponseHandle> {
  const subscriber = getRedisSubscriber();
  await subscriber.subscribe(getReferenceString(agent));
  subscribers.add(subscriber);

  subscriber.on('message', async (_channel, msg) => {
    const message = JSON.parse(msg) as BaseAgentMessage;
    if (!message.callback) {
      throw new Error('No callback in message to message received');
    }
    if (message.type === msgType) {
      await getRedis().publish(message.callback, JSON.stringify(res));
    }
  });

  return {
    cleanup: () => {
      subscriber.disconnect();
      subscribers.delete(subscriber);
    },
  };
}

export function expectBundleToContainOutcome(
  bundle: Bundle<Parameters>,
  agent: Agent,
  outcome: Partial<OperationOutcome> & { issue: OperationOutcomeIssue[] }
): void {
  const entries = bundle.entry as BundleEntry<Parameters>[];
  expect(entries).toContainEqual({
    resource: expect.objectContaining<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining<ParametersParameter>([
        expect.objectContaining<ParametersParameter>({
          name: 'agent',
          resource: expect.objectContaining<Agent>(agent),
        }),
        expect.objectContaining<ParametersParameter>({
          name: 'result',
          resource: expect.objectContaining<Partial<OperationOutcome>>(outcome),
        }),
      ]),
    }),
  });
}
