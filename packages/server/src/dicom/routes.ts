import { Request, Response, Router } from 'express';
import { authenticateRequest } from '../oauth/middleware';

export const dicomRouter = Router().use(authenticateRequest);

// DICOMweb WADO
// https://www.dicomstandard.org/dicomweb

dicomRouter.get('/studies', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.post('/studies', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.post('/studies/:study', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/rendered', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/rendered', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/metadata', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/rendered', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/metadata', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/frames/:frame', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/:bulkdataUriReference', (_req: Request, res: Response) => {
  res.sendStatus(200);
});
