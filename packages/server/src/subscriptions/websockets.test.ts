import { Patient, Project, Subscription } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import express from 'express';
import { Server } from 'http';
import { randomUUID } from 'node:crypto';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { MedplumServerConfig, loadTestConfig } from '../config';
import { Repository } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { execSubscriptionJob, getSubscriptionQueue } from '../workers/subscription';

const app = express();
let config: MedplumServerConfig;
let server: Server;
let project: Project;
let repo: Repository;
let accessToken: string;

jest.mock('hibp');
jest.mock('ioredis');

describe('WebSockets Subscriptions', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    server = await initApp(app, config);

    const response = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    project = response.project;
    accessToken = response.accessToken;

    repo = new Repository({
      extendedMode: true,
      project: project.id,
      author: {
        reference: 'ClientApplication/' + randomUUID(),
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 511, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Valid subscription', () =>
    withTestContext(async () => {
      const version1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alicr'], family: 'Smith' }],
        meta: {
          lastUpdated: new Date(Date.now() - 1000 * 60).toISOString(),
        },
      });
      expect(version1).toBeDefined();
      expect(version1.id).toBeDefined();

      // Create subscription to watch patient
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'test',
        status: 'active',
        criteria: 'Patient',
        channel: {
          type: 'websocket',
        },
      });
      expect(subscription).toBeDefined();

      // Call $get-ws-binding-token
      const res = await request(server)
        .get(`/fhir/R4/Subscription/${subscription.id}/$get-ws-binding-token`)
        .set('Authorization', 'Bearer ' + accessToken);

      expect(res.body).toBeDefined();

      let version2!: Record<string, any>;
      await request(server)
        .ws('/ws/subscriptions-r4')
        .set('Authorization', 'Bearer ' + accessToken)
        .sendJson({ type: 'bind-with-token', payload: { token: accessToken } })
        // Add a new patient for this project
        .exec(async () => {
          const queue = getSubscriptionQueue() as any;
          queue.add.mockClear();

          // Update the patient
          version2 = await repo.updateResource<Patient>({
            resourceType: 'Patient',
            id: version1.id,
            name: [{ given: ['Alice'], family: 'Smith' }],
            active: true,
            meta: {
              lastUpdated: new Date().toISOString(),
            },
          });
          expect(version2).toBeDefined();

          const job = { id: 1, data: queue.add.mock.calls[0][1] } as unknown as Job;
          await execSubscriptionJob(job);

          // Update should also trigger the subscription
          expect(queue.add).toHaveBeenCalled();

          // Clear the queue
          queue.add.mockClear();
        })
        .expectJson(version2)
        .close()
        .expectClosed();
    }));
});
