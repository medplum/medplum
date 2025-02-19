import { Repository } from '../../fhir/repo';

export interface Migration {
  run(repo: Repository): Promise<void>;
}
