import { Request, Response, Router } from 'express';

export const dicomRouter = Router();

// DICOMweb WADO
// https://www.dicomstandard.org/dicomweb

dicomRouter.get('/studies', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.post('/studies', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.post('/studies/:study', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/rendered', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/rendered', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/metadata', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/rendered', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/metadata', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/frames/:frame', (req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/:bulkdataUriReference', (req: Request, res: Response) => {
  res.sendStatus(200);
});
