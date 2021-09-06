import { Request, Response, Router } from 'express';
import { authenticateToken } from '../oauth';

export const scimRouter = Router();
scimRouter.use(authenticateToken);

// SCIM
// http://www.simplecloud.info/

scimRouter.get('/:resourceType', (req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.post('/:resourceType', (req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.get('/:resourceType/:id', (req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.put('/:resourceType/:id', (req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.delete('/:resourceType/:id', (req: Request, res: Response) => {
  res.sendStatus(200);
});

scimRouter.patch('/:resourceType/:id', (req: Request, res: Response) => {
  res.sendStatus(200);
});
