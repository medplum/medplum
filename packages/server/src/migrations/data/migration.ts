import { AsyncJob } from '@medplum/fhirtypes';
import { Repository } from '../../fhir/repo';
import { WithId } from '@medplum/core';

export interface Migration {
  run(repo: Repository, asyncJob: WithId<AsyncJob>): Promise<void>;
}
