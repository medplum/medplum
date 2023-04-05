export const CreateLogGroupCommand = jest.fn(() => ({}));

export const CreateLogStreamCommand = jest.fn(() => ({}));

export const PutLogEventsCommand = jest.fn(() => ({}));

export const CloudWatchLogsClient = jest.fn(() => ({
  send: jest.fn(),
}));

export class ResourceAlreadyExistsException extends Error {}
