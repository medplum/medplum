const bullmq = jest.createMockFromModule('bullmq') as any;
export const Queue = bullmq.Queue;
export const QueueScheduler = bullmq.QueueScheduler;
export const Worker = bullmq.Worker;
