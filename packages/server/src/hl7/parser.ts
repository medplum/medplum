import { Hl7Message } from '@medplum/core';
import { NextFunction, Request, RequestHandler, Response } from 'express';

export interface HL7BodyParserOptions {
  type: string[];
}

/**
 * Returns an Express middleware handler for parsing HL7 messages.
 * @param options - HL7 parser options to specify content types.
 * @returns Express middleware request handler.
 */
export function hl7BodyParser(options: HL7BodyParserOptions): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.is(options.type)) {
      req.body = Hl7Message.parse(req.body);
    }
    next();
  };
}
