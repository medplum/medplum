declare const vi;

export const SendEmailCommand = vi.fn(() => ({}));
export const SESv2Client = vi.fn(() => ({
  send: vi.fn(),
}));
