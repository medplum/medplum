const bullmq = jest.createMockFromModule('bullmq') as any;
export class Queue extends bullmq.Queue {
  add = jest.fn().mockImplementation(async (jobName: string, jobData: any, options: any) => {
    return {
      id: '123',
      name: jobName,
      data: jobData,
      opts: options,
    };
  });
}
export const Worker = bullmq.Worker;
export const DelayedError = bullmq.DelayedError;
