import { NextFunction, Request, Response, Router } from 'express';
import { authenticateToken } from '../oauth';
import { createBatch } from './batch';
import { binaryRouter } from './binary';
import { badRequest } from './outcomes';
import { repo } from './repo';
import { validateResource } from './schema';
import { parseSearchRequest } from './search';

export const fhirRouter = Router();
fhirRouter.use(authenticateToken);

// JSON interceptor
// Unlike the normal express.json() middleware, we strictly require content type
fhirRouter.use((req: Request, res: Response, next: NextFunction) => {
  const oldSend = res.send;
  res.send = (data: any) => {
    // Restore the original send to avoid double response
    // See: https://stackoverflow.com/a/60817116
    res.send = oldSend;

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

    return res.send(data);
  };
  next();
});

// Binary routes
fhirRouter.use('/Binary/', binaryRouter);

// Create batch
fhirRouter.post('/', async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    return res.status(400).send('Unsupported content type');
  }
  const bundle = req.body;
  if (bundle.resourceType !== 'Bundle') {
    return res.status(400).send(badRequest('Not a bundle'));
  }
  const [outcome, result] = await createBatch(bundle);
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(result);
});

// Search
fhirRouter.get('/:resourceType', async (req: Request, res: Response) => {
  const { resourceType } = req.params;
  const query = req.query as Record<string, string | undefined>;
  const [outcome, bundle] = await repo.search(parseSearchRequest(resourceType, query));
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(bundle);
});

// Create resource
fhirRouter.post('/:resourceType', async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    return res.status(400).send('Unsupported content type');
  }
  const { resourceType } = req.params;
  const resource = req.body;
  if (resource.resourceType !== resourceType) {
    return res.status(400).send(badRequest('Incorrect resource type'));
  }
  const [outcome, result] = await repo.createResource(resource);
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(201).send(result);
});

// Read resource by ID
fhirRouter.get('/:resourceType/:id', async (req: Request, res: Response) => {
  const { resourceType, id } = req.params;
  const [outcome, resource] = await repo.readResource(resourceType, id);
  if (outcome.id === 'not-found') {
    return res.status(404).send(outcome);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(resource);
});

// Read resource history
fhirRouter.get('/:resourceType/:id/_history', async (req: Request, res: Response) => {
  const { resourceType, id } = req.params;
  const [outcome, bundle] = await repo.readHistory(resourceType, id);
  if (outcome.id === 'not-found') {
    return res.status(404).send(outcome);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(bundle);
});

// Read resource version by version ID
fhirRouter.get('/:resourceType/:id/_history/:vid', async (req: Request, res: Response) => {
  const { resourceType, id, vid } = req.params;
  const [outcome, resource] = await repo.readVersion(resourceType, id, vid);
  if (outcome.id === 'not-found') {
    return res.status(404).send(outcome);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(resource);
});

// Update resource
fhirRouter.put('/:resourceType/:id', async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    return res.status(400).send('Unsupported content type');
  }
  const { resourceType, id } = req.params;
  const resource = req.body;
  if (resource.resourceType !== resourceType) {
    return res.status(400).send(badRequest('Incorrect resource type'));
  }
  if (resource.id !== id) {
    return res.status(400).send(badRequest('Incorrect ID'));
  }
  const [outcome, result] = await repo.updateResource(resource);
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(result);
});

// Delete resource
fhirRouter.delete('/:resourceType/:id', async (req: Request, res: Response) => {
  const { resourceType, id } = req.params;
  const [outcome, resource] = await repo.deleteResource(resourceType, id);
  if (outcome.id === 'not-found') {
    return res.status(404).send(outcome);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(resource);
});

// Patch resource
fhirRouter.patch('/:resourceType/:id', async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    return res.status(400).send('Unsupported content type');
  }
  res.status(200).send({});
});

// Validate create resource
fhirRouter.post('/:resourceType/([$])validate', async (req: Request, res: Response) => {
  if (!isFhirJsonContentType(req)) {
    return res.status(400).send('Unsupported content type');
  }
  const outcome = validateResource(req.body);
  res.status(outcome.id === 'allok' ? 200 : 400).send(outcome);
});

function isFhirJsonContentType(req: Request) {
  return req.is('application/json') || req.is('application/fhir+json');
}
