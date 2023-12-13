import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const currentDate = new Date();
  const thirtyMinutesAgo = new Date(currentDate.getTime() - 30 * 60 * 1000);
  const timeStamp = thirtyMinutesAgo.toISOString();

  await medplum.searchResources('Communication', {
    _lastUpdated: `lt${timeStamp}`,
  });
}
