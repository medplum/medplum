// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import { sendOutcome } from '../fhir/outcomes';
import { allOk, badRequest } from '@medplum/core';
import { callAI } from './server';

export const aiRouter = Router();

aiRouter.post('/', async (req, res) => {
  const { messages, apiKey, model } = req.body;

  if (!apiKey) {
    sendOutcome(res, badRequest('API key is required'));
    return;
  }

  if (!model) {
    sendOutcome(res, badRequest('Model is required'));
    return;
  }

  const result = await callAI(messages, apiKey, model);
  return [allOk, result];
});