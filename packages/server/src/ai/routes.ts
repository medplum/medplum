// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import { callAI } from './server';

export const aiRouter = Router();

aiRouter.post('/', async (req, res) => {
  const { messages, apiKey, model } = req.body;

  if (!apiKey) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'API key is required',
    });
    return;
  }

  if (!model) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Model is required',
    });
    return;
  }

  const result = await callAI(messages, apiKey, model);
  res.json(result);
});
