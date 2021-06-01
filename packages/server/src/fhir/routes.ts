import { Request, Response, Router } from 'express';
import { binaryRouter } from './binary';
import { badRequest } from './outcomes';
import { repo } from './repo';
import { validateResource } from './schema';
import { parseSearchRequest } from './search';

export const fhirRouter = Router();
fhirRouter.use('/Binary/', binaryRouter);

// Create batch
fhirRouter.post('/', (req: Request, res: Response) => {
  res.sendStatus(201);
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
  const { resourceType } = req.params;
  const resource = req.body;
  if (resource.resourceType !== resourceType) {
    console.log('path param', resourceType);
    console.log('resource value', resource.resourceType);
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
  const [outcome, resource] = await repo.readResource(resourceType, id);
  if (outcome.id === 'not-found') {
    return res.status(404).send(outcome);
  }
  if (outcome.id !== 'allok') {
    return res.status(400).send(outcome);
  }
  res.status(200).send(resource);
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
  res.status(200).send({});
});

// Validate create resource
fhirRouter.post('/:resourceType/([$])validate', async (req: Request, res: Response) => {
  const data = req.body as any;
  const outcome = validateResource(data);
  res.status(outcome.id === 'allok' ? 200 : 400).send(outcome);
});
