// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { singularize } from '@medplum/core';
import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import { HybridBackend } from '../backends/hybrid/hybrid-backend';
import { SimulatedBackend } from '../backends/simulated/simulated-backend';
import type { Backend } from '../backends/backend';
import { Scenario } from '../scenario/scenario';
import { listTemplates } from '../templates';
import type { Command, RecordedScenario, ScenarioSpec } from '../types';

/**
 * Minimal HTTP control plane for the harness.
 *
 * Endpoints:
 *   GET  /templates             — list registered agent templates
 *   POST /scenarios             — create + start a scenario from a ScenarioSpec
 *   GET  /scenarios             — list scenarios with status
 *   GET  /scenarios/:id         — full status for one scenario
 *   POST /scenarios/:id/commands — issue a command (body: Command)
 *   POST /scenarios/:id/stop    — stop the scenario
 *   GET  /scenarios/:id/recording — download the recorded event timeline
 *   POST /scenarios/:id/replay  — start replaying a previous recording
 */
export class HarnessHttpServer {
  private app: Express;
  private server?: Server;
  private scenarios = new Map<string, Scenario>();
  private nextId = 1;

  constructor() {
    this.app = express();
    this.app.use(express.json({ limit: '5mb' }));
    this.registerRoutes();
  }

  async listen(port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.server = this.app.listen(port, () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('failed to bind HTTP server'));
        }
      });
    });
  }

  async close(): Promise<void> {
    for (const scenario of this.scenarios.values()) {
      await scenario.stop().catch(() => undefined);
    }
    this.scenarios.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = undefined;
    }
  }

  private registerRoutes(): void {
    this.app.get('/templates', (_req: Request, res: Response) => {
      res.json(listTemplates().map((t) => ({ name: t.name, description: t.description })));
    });

    this.app.post('/scenarios', async (req: Request, res: Response) => {
      try {
        const spec = req.body as ScenarioSpec;
        const backend = this.makeBackend(spec);
        const scenario = new Scenario(spec, backend);
        const id = `s${this.nextId++}`;
        this.scenarios.set(id, scenario);
        await scenario.start();
        res.status(201).json({ id, status: scenario.getStatus() });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    });

    this.app.get('/scenarios', (_req: Request, res: Response) => {
      res.json(
        [...this.scenarios.entries()].map(([id, s]) => ({
          id,
          name: s.spec.name,
          status: s.getStatus(),
        }))
      );
    });

    this.app.get('/scenarios/:id', (req: Request, res: Response) => {
      const scenario = this.scenarios.get(singularize(req.params.id) ?? '');
      if (!scenario) return void res.status(404).json({ error: 'not found' });
      res.json({ id: req.params.id, status: scenario.getStatus(), spec: scenario.spec });
    });

    this.app.post('/scenarios/:id/commands', async (req: Request, res: Response) => {
      const scenario = this.scenarios.get(singularize(req.params.id) ?? '');
      if (!scenario) return void res.status(404).json({ error: 'not found' });
      try {
        await scenario.issueCommand(req.body as Command);
        res.status(202).json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    });

    this.app.post('/scenarios/:id/stop', async (req: Request, res: Response) => {
      const scenario = this.scenarios.get(singularize(req.params.id) ?? '');
      if (!scenario) return void res.status(404).json({ error: 'not found' });
      await scenario.stop();
      res.json({ ok: true, status: scenario.getStatus() });
    });

    this.app.get('/scenarios/:id/recording', (req: Request, res: Response) => {
      const scenario = this.scenarios.get(singularize(req.params.id) ?? '');
      if (!scenario) return void res.status(404).json({ error: 'not found' });
      res.json(scenario.recorder.snapshot());
    });

    this.app.post('/scenarios/:id/replay', (req: Request, res: Response) => {
      const scenario = this.scenarios.get(singularize(req.params.id) ?? '');
      if (!scenario) return void res.status(404).json({ error: 'not found' });
      try {
        const rec = req.body as RecordedScenario;
        const commands = rec.events
          .filter((e) => e.type === 'command.issued')
          .map((e) => ({ atMs: e.atMs, command: e.data as Command }));
        scenario.replay(commands);
        res.json({ ok: true, scheduled: commands.length });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    });
  }

  private makeBackend(spec: ScenarioSpec): Backend {
    if (spec.backend === 'real') {
      throw new Error(
        'RealBackend cannot be constructed from a ScenarioSpec alone — instantiate it programmatically with credentials and pass it to new Scenario(spec, backend).'
      );
    }
    if (spec.backend === 'hybrid') {
      return new HybridBackend();
    }
    return new SimulatedBackend();
  }
}
