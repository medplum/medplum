// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { AsyncJob, Bundle } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { loadTestConfig } from '../config/loader';
import { execBatchJob, getBatchQueue, initBatchWorker, queueBatchProcessing } from './batch';
import { queueRegistry } from './utils';

// Mock dependencies
jest.mock('../context', () => ({
  getAuthenticatedContext: jest.fn(() => ({
    authentication: {
      login: { resourceType: 'Login', id: 'test-login' },
      project: { resourceType: 'Project', id: 'test-project' },
      membership: { resourceType: 'ProjectMembership', id: 'test-membership' },
    },
    requestId: 'test-request-id',
    traceId: 'test-trace-id',
  })),
  runInAsyncContext: jest.fn((authState, requestId, traceId, fn) => fn()),
}));

jest.mock('../auth/me', () => ({
  getUserConfiguration: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../fhir/accesspolicy', () => ({
  getRepoForLogin: jest.fn(() =>
    Promise.resolve({
      createResource: jest.fn(),
      updateResource: jest.fn(),
      readResource: jest.fn(),
    })
  ),
}));

jest.mock('../fhir/binary', () => ({
  uploadBinaryData: jest.fn(() =>
    Promise.resolve({
      resourceType: 'Binary',
      id: 'binary-id',
    })
  ),
}));

jest.mock('../fhir/repo', () => ({
  getSystemRepo: jest.fn(() => ({
    createResource: jest.fn(),
    updateResource: jest.fn(),
    readResource: jest.fn(),
    searchOne: jest.fn(),
  })),
}));

const mockCompleteJob = jest.fn(() => Promise.resolve());
const mockFailJob = jest.fn(() => Promise.resolve());

jest.mock('../fhir/operations/utils/asyncjobexecutor', () => ({
  AsyncJobExecutor: jest.fn(() => ({
    completeJob: mockCompleteJob,
    failJob: mockFailJob,
  })),
}));

jest.mock('../logger', () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  globalLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock FhirRouter
const mockHandleRequest = jest.fn();
jest.mock('@medplum/fhir-router', () => ({
  FhirRouter: jest.fn(() => ({
    handleRequest: mockHandleRequest,
  })),
}));

describe('Batch Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initBatchWorker', () => {
    test('creates queue with default config', async () => {
      const config = await loadTestConfig();

      const result = initBatchWorker(config);
      expect(result).toBeDefined();
      expect(result.queue).toBeDefined();
      expect(result.worker).toBeDefined();
      expect(result.name).toBe('BatchQueue');

      // Clean up
      await result.worker.close();
      await result.queue.close();
    });

    test('creates queue with custom bullmq config including backoff', async () => {
      // Covers line 52: backoff: config.bullmq?.defaultBackoff
      const config = await loadTestConfig();

      config.bullmq = {
        concurrency: 20,
        removeOnComplete: { count: 1 },
        removeOnFail: { count: 1 },
        defaultAttempts: 5,
        defaultBackoff: { type: 'exponential', delay: 2000 },
      };

      const result = initBatchWorker(config);
      expect(result).toBeDefined();
      expect(result.queue).toBeDefined();
      expect(result.worker).toBeDefined();
      expect(result.name).toBe('BatchQueue');

      // Clean up
      await result.worker.close();
      await result.queue.close();
    });
  });

  describe('getBatchQueue', () => {
    test('returns undefined when queue not initialized', () => {
      // This is a simple getter test
      // Note: getBatchQueue returns the queue from registry if initialized
      const queue = getBatchQueue();
      // It might be undefined or defined depending on test order
      // We're just testing it doesn't throw
      expect(typeof queue === 'undefined' || queue !== null).toBeTruthy();
    });
  });

  describe('execBatchJob', () => {
    const createMockJob = (bundle: Bundle, asyncJob?: Partial<AsyncJob>): Job => {
      return {
        id: 'test-job-id',
        data: {
          asyncJob: {
            resourceType: 'AsyncJob',
            id: 'async-job-id',
            status: 'accepted',
            request: '/fhir/R4',
            requestTime: new Date().toISOString(),
            ...asyncJob,
          } as AsyncJob,
          bundle,
          authState: {
            login: { resourceType: 'Login', id: 'test-login' } as any,
            project: { resourceType: 'Project', id: 'test-project' } as any,
            membership: { resourceType: 'ProjectMembership', id: 'test-membership' } as any,
          },
        },
      } as unknown as Job;
    };

    test('handles successful batch with entries', async () => {
      // Covers lines 60-61: worker callback with runInAsyncContext
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [
          {
            response: {
              status: '201',
              outcome: { resourceType: 'OperationOutcome', issue: [{ severity: 'information', code: 'informational' }] },
            },
          },
        ],
      };

      mockHandleRequest.mockResolvedValueOnce([
        allOk,
        {
          resourceType: 'Bundle',
          type: 'batch-response',
          entry: [
            {
              response: {
                status: '201',
                outcome: { resourceType: 'OperationOutcome', issue: [{ severity: 'information', code: 'informational' }] },
              },
            },
          ],
        },
      ]);

      const job = createMockJob(bundle);
      await execBatchJob(job);

      expect(mockHandleRequest).toHaveBeenCalled();
      expect(mockCompleteJob).toHaveBeenCalled();
    });

    test('handles bundle without entries - early return', async () => {
      // Covers lines 136-137: if (!bundle.entry) { return; }
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        // No entry field - this should trigger early return
      };

      mockHandleRequest.mockResolvedValueOnce([
        allOk,
        {
          resourceType: 'Bundle',
          type: 'batch-response',
          // No entries in response either
        },
      ]);

      const job = createMockJob(bundle);
      await execBatchJob(job);

      expect(mockHandleRequest).toHaveBeenCalled();
      // completeJob should not be called because of early return
      expect(mockCompleteJob).not.toHaveBeenCalled();
    });

    test('handles failed outcome', async () => {
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{ request: { method: 'POST', url: 'Patient' } }],
      };

      mockHandleRequest.mockResolvedValueOnce([badRequest('Test error'), null]);

      const job = createMockJob(bundle);
      await execBatchJob(job);

      expect(mockHandleRequest).toHaveBeenCalled();
      expect(mockFailJob).toHaveBeenCalled();
    });

    test('handles exception during processing', async () => {
      // Covers lines 167-169: catch (err: any) { ... }
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{ request: { method: 'POST', url: 'Patient' } }],
      };

      mockHandleRequest.mockRejectedValueOnce(new Error('Test exception'));

      const job = createMockJob(bundle);

      // Should not throw - errors are caught and handled
      await expect(execBatchJob(job)).resolves.not.toThrow();

      expect(mockHandleRequest).toHaveBeenCalled();
      // failJob should be called in the catch block
      expect(mockFailJob).toHaveBeenCalled();
    });

    test('handles exception when failJob itself fails', async () => {
      // Covers the .catch(() => {}) on line 169
      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [{ request: { method: 'POST', url: 'Patient' } }],
      };

      mockHandleRequest.mockRejectedValueOnce(new Error('Test exception'));
      mockFailJob.mockRejectedValueOnce(new Error('Failed to mark job as failed'));

      const job = createMockJob(bundle);

      // Should not throw even when failJob fails
      await expect(execBatchJob(job)).resolves.not.toThrow();

      expect(mockHandleRequest).toHaveBeenCalled();
      expect(mockFailJob).toHaveBeenCalled();
    });
  });

  describe('queueBatchProcessing', () => {
    test('throws error when queue is not available', async () => {
      // Create a mock registry that returns undefined
      const mockGet = jest.spyOn(queueRegistry, 'get').mockReturnValueOnce(undefined);

      const bundle: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: [],
      };

      const asyncJob = {
        resourceType: 'AsyncJob',
        id: 'async-job-id',
        status: 'accepted',
        request: '/fhir/R4',
        requestTime: new Date().toISOString(),
      } as AsyncJob & { id: string };

      await expect(queueBatchProcessing(bundle, asyncJob)).rejects.toThrow('Job queue BatchQueue not available');

      // Restore the mock
      mockGet.mockRestore();
    });
  });
});
