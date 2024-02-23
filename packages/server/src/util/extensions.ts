import { Extension } from '@medplum/fhirtypes';
import { RequestContext } from '../context';

export const createTracingExtension = (ctx: RequestContext): Extension => ({
  url: 'https://medplum.com/fhir/StructureDefinition/tracing',
  extension: [
    { url: 'requestId', valueUuid: ctx.requestId },
    { url: 'traceId', valueUuid: ctx.traceId },
  ],
});
