import { Filter, Operator, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { initAppServices } from '../app';
import { loadConfig } from '../config/loader';
import { AuthenticatedRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { requestContextStore } from '../request-context-store';
import { addReindexJob } from '../workers/reindex';
import { queueRegistry } from '../workers/utils';

const DO_OBLITERATE = false;
const DO_ADD_JOBS = false;

async function main(): Promise<void> {
  const resourceTypes = process.argv[2].split(',') as ResourceType[];
  console.log(resourceTypes);

  const config = await loadConfig('file:medplum.config.json');
  await initAppServices(config);

  const queue = queueRegistry.get('ReindexQueue');
  if (!queue) {
    throw new Error('Could not find queue');
  }

  if (DO_OBLITERATE) {
    console.log('obliterating queue...');
    await queue.clean(0, 0, 'active');
    await queue.drain(true);
    await queue.obliterate();
  } else {
    await queue.resume();
  }

  const systemRepo = getSystemRepo();

  const maxResourceVersion = 5;
  const beforeDate = new Date('2025-06-01T00:00:00Z'); // new Date();
  let startDate: Date | undefined = new Date('2025-04-15T00:00:00Z');
  let endDate: Date | undefined;
  const intervalMinutes = 24 * 60 * 30; // 30 days

  do {
    const searchRequest: SearchRequest & { filters: Filter[] } = { resourceType: resourceTypes[0], filters: [] };
    if (startDate) {
      endDate = new Date(new Date(startDate).setUTCMinutes(startDate.getUTCMinutes() + intervalMinutes));
      endDate = new Date(Math.min(endDate.getTime(), beforeDate.getTime()));
    }

    const urlQueryParts: string[] = [];
    if (startDate !== undefined) {
      urlQueryParts.push(`_lastUpdated=ge${startDate.toISOString()}`);
      searchRequest.filters.push({
        code: '_lastUpdated',
        operator: Operator.GREATER_THAN_OR_EQUALS,
        value: startDate.toISOString(),
      });
    }
    if (endDate !== undefined) {
      urlQueryParts.push(`_lastUpdated=lt${endDate.toISOString()}`);
      searchRequest.filters.push({ code: '_lastUpdated', operator: Operator.LESS_THAN, value: endDate.toISOString() });
    }
    const url = `${resourceTypes.join(',')}?${urlQueryParts.join('&')}`;
    console.log(url);

    if (DO_ADD_JOBS) {
      await requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
        const exec = new AsyncJobExecutor(systemRepo);
        await exec.init(url);
        await exec.run(async (asyncJob) => {
          const job = await addReindexJob(resourceTypes as ResourceType[], asyncJob, searchRequest, maxResourceVersion);
          console.log(`Added job ${job.id}`);
        });
      });
    }

    startDate = endDate;
  } while (startDate && startDate < beforeDate);
}

main()
  .then(() => console.log('Done'))
  .catch((err) => {
    console.error(err);
    console.error(JSON.stringify(err, null, 2));
  });
