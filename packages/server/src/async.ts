import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an express handler with an async handler.
 * See: https://zellwk.com/blog/async-await-express/
 * This is almost the exact same as express-async-handler,
 * except that package is out of date and lacks TypeScript bindings.
 * https://www.npmjs.com/package/express-async-handler/v/1.1.4
 * @param callback - The handler.
 * @returns Async wrapped handler.
 */
export function asyncWrap(callback: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return function (req: Request, res: Response, next: NextFunction): void {
    callback(req, res, next).catch(next);
  };
}
