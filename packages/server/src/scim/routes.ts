import { Request, Response, Router } from 'express';
import { authenticateToken } from '../oauth';

export const scimRouter = Router();
scimRouter.use(authenticateToken);

// SCIM
// http://www.simplecloud.info/

scimRouter.get('/:resourceType', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.post('/:resourceType', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.get('/:resourceType/:id', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.put('/:resourceType/:id', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.delete('/:resourceType/:id', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.patch('/:resourceType/:id', (_req: Request, res: Response) => {
  res.sendStatus(200);
});
