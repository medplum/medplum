import { Request, Response, Router } from 'express';
import { logger } from '../logger';
import { authenticateToken } from '../oauth';
import { Message } from './parser';

export const HL7_V2_ER7_CONTENT_TYPE = 'x-application/hl7-v2+er7';

export const hl7Router = Router();
hl7Router.use(authenticateToken);

hl7Router.post('/', (req: Request, res: Response) => {
  logger.info('Received HL7: ' + req.body.toString());
  try {
    const body = req.body as Message | string;
    const message = typeof body === 'string' ? Message.parse(body) : body;
    const result = message.buildAck();
    res.status(200).contentType(HL7_V2_ER7_CONTENT_TYPE).send(result.toString());
  } catch (err) {
    res.status(400).send((err as Error).message);
  }
});
