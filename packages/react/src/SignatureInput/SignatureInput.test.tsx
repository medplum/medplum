import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import SignaturePad from 'signature_pad';
import { act, render, screen } from '../test-utils/render';
import { SignatureInput } from './SignatureInput';

jest.mock('signature_pad', () => {
  return jest.fn().mockImplementation(() => ({
    fromDataURL: jest.fn(),
    clear: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    toDataURL: jest.fn(() => 'data:image/png;base64,signature-data'),
  }));
});

describe('SignatureInput', () => {
  const medplum = new MockClient();

  async function setup(child: ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Renders', async () => {
    const handleChange = jest.fn();

    await setup(<SignatureInput onChange={handleChange} />);
    expect(screen.getByLabelText('Signature input area')).toBeInTheDocument();
    expect(SignaturePad).toHaveBeenCalledTimes(1);

    const signaturePadConstructor = SignaturePad as jest.Mock;
    expect(signaturePadConstructor).toBeDefined();

    const signaturePadInstance = (signaturePadConstructor as jest.Mock).mock.results[0].value;
    expect(signaturePadInstance).toBeDefined();
    expect(signaturePadInstance.addEventListener).toHaveBeenCalledTimes(1);

    const clearButton = screen.getByLabelText('Clear signature');
    expect(clearButton).toBeInTheDocument();
    act(() => {
      clearButton.click();
    });

    const handler = (signaturePadInstance.addEventListener as jest.Mock).mock.calls[0][1];
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');

    act(() => {
      handler();
    });
    expect(handleChange).toHaveBeenCalledWith({
      type: [
        {
          system: 'http://hl7.org/fhir/signature-type',
          code: 'ProofOfOrigin',
          display: 'Proof of Origin',
        },
      ],
      when: expect.any(String),
      who: expect.objectContaining({ reference: expect.any(String) }),
      data: expect.any(String),
    });
  });
});
