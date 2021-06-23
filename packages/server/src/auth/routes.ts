import { randomUUID } from 'crypto';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { invalidRequest, isOk, sendOutcome } from '../fhir';
import { tryLogin } from '../oauth/login';

export const authRouter = Router();

authRouter.post(
  '/login',
  body('clientId').exists().withMessage('Missing clientId'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
  body('scope').notEmpty().withMessage('Missing scope'),
  body('role').notEmpty().withMessage('Missing role'),
  asyncWrap(async (req: Request, res: Response) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendOutcome(res, invalidRequest(errors));
    }

    const [outcome, result] = await tryLogin({
      clientId: req.body.clientId,
      email: req.body.email,
      password: req.body.password,
      scope: req.body.scope,
      role: req.body.role,
      nonce: randomUUID(),
      remember: true
    });

    if (!isOk(outcome)) {
      return sendOutcome(res, outcome);
    }

    res.status(200).json(result);
  }));
