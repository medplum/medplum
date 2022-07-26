export const SendEmailCommand = jest.fn(() => ({}));
export const SESv2Client = jest.fn(() => ({
  send: jest.fn(),
}));
