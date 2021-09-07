import { assertOk, badRequest, getStatus } from '@medplum/core';
import { NextFunction, Request, Response, Router } from 'express';
import { graphqlHTTP } from 'express-graphql';
import { Operation } from 'fast-json-patch';
import { asyncWrap } from '../async';
import { authenticateToken } from '../oauth';
import { createBatch } from './batch';
import { binaryRouter } from './binary';
import { expandOperator } from './expand';
import { getRootSchema } from './graphql';
import { getCapabilityStatement } from './metadata';
import { sendOutcome } from './outcomes';
import { Repository } from './repo';
import { validateResource } from './schema';
import { parseSearchRequest } from './search';

export const fhirRouter = Router();
fhirRouter.use(authenticateToken);

// OperationOutcome interceptor
fhirRouter.use((req: Request, res: Response, next: NextFunction) => {
  const oldJson = res.json;

  res.json = (data: any) => {
    // Restore the original json to avoid double response
    // See: https://stackoverflow.com/a/60817116
    res.json = oldJson;

    // FHIR "Prefer" header preferences
    // See: https://www.hl7.org/fhir/http.html#ops
    // Prefer: return=minimal
    // Prefer: return=representation
    // Prefer: return=OperationOutcome
    const prefer = req.get('Prefer');
    if (prefer === 'return=minimal') {
      return res.send();
    }

    // Unless already set, use the FHIR content type
    if (!res.get('Content-Type')) {
      res.contentType('application/fhir+json');
    }

    return res.json(data);
  };
  next();
});

// Metadata / CapabilityStatement
fhirRouter.get('/metadata', (req: Request, res: Response) => {
  res.status(200).json(getCapabilityStatement());
});

// Binary routes
fhirRouter.use('/Binary/', binaryRouter);

// ValueSet $expand operation
fhirRouter.get('/ValueSet/([$]|%24)expand', expandOperator);

// GraphQL
fhirRouter.use('/([$]|%24)graphql', graphqlHTTP({
  schema: getRootSchema()
}));

// Create batch
fhirRouter.post('/', asyncWrap(async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    res.status(400).send('Unsupported content type');
    return;
  }
  const bundle = req.body;
  if (bundle.resourceType !== 'Bundle') {
    sendOutcome(res, badRequest('Not a bundle'));
    return;
  }
  const repo = res.locals.repo as Repository;
  const [outcome, result] = await createBatch(repo, bundle);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(result);
}));

// Search
fhirRouter.get('/:resourceType', asyncWrap(async (req: Request, res: Response) => {
  const { resourceType } = req.params;
  const repo = res.locals.repo as Repository;
  const query = req.query as Record<string, string | undefined>;
  const [outcome, bundle] = await repo.search(parseSearchRequest(resourceType, query));
  assertOk(outcome);
  res.status(getStatus(outcome)).json(bundle);
}));

// Create resource
fhirRouter.post('/:resourceType', asyncWrap(async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    res.status(400).send('Unsupported content type');
    return;
  }
  const { resourceType } = req.params;
  const resource = req.body;
  if (resource.resourceType !== resourceType) {
    sendOutcome(res, badRequest('Incorrect resource type'));
    return;
  }
  const repo = res.locals.repo as Repository;
  const [outcome, result] = await repo.createResource(resource);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(result);
}));

// Read resource by ID
fhirRouter.get('/:resourceType/:id', asyncWrap(async (req: Request, res: Response) => {
  const { resourceType, id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.readResource(resourceType, id);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(resource);
}));

// Read resource history
fhirRouter.get('/:resourceType/:id/_history', asyncWrap(async (req: Request, res: Response) => {
  const { resourceType, id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, bundle] = await repo.readHistory(resourceType, id);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(bundle);
}));

// Read resource version by version ID
fhirRouter.get('/:resourceType/:id/_history/:vid', asyncWrap(async (req: Request, res: Response) => {
  const { resourceType, id, vid } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.readVersion(resourceType, id, vid);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(resource);
}));

// Update resource
fhirRouter.put('/:resourceType/:id', asyncWrap(async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    res.status(400).send('Unsupported content type');
    return;
  }
  const { resourceType, id } = req.params;
  const resource = req.body;
  if (resource.resourceType !== resourceType) {
    sendOutcome(res, badRequest('Incorrect resource type'));
    return;
  }
  if (resource.id !== id) {
    sendOutcome(res, badRequest('Incorrect ID'));
    return;
  }
  const repo = res.locals.repo as Repository;
  const [outcome, result] = await repo.updateResource(resource);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(result);
}));

// Delete resource
fhirRouter.delete('/:resourceType/:id', asyncWrap(async (req: Request, res: Response) => {
  const { resourceType, id } = req.params;
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.deleteResource(resourceType, id);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(resource);
}));

// Patch resource
fhirRouter.patch('/:resourceType/:id', asyncWrap(async (req: Request, res: Response) => {
  if (!req.is('application/json-patch+json')) {
    res.status(400).send('Unsupported content type');
    return;
  }
  const { resourceType, id } = req.params;
  const patch = req.body as Operation[];
  const repo = res.locals.repo as Repository;
  const [outcome, resource] = await repo.patchResource(resourceType, id, patch);
  assertOk(outcome);
  res.status(getStatus(outcome)).json(resource);
}));

// Validate create resource
fhirRouter.post('/:resourceType/([$])validate', asyncWrap(async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    res.status(400).send('Unsupported content type');
    return;
  }
  const outcome = validateResource(req.body);
  sendOutcome(res, outcome);
}));

function isFhirJsonContentType(req: Request) {
  return req.is('application/json') || req.is('application/fhir+json');
}
