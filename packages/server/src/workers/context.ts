import { Resource } from '@medplum/fhirtypes';

export interface BackgroundJobContext {
  interaction: 'create' | 'update' | 'delete';
  previousVersion?: Resource;
}
