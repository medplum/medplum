import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { act, render, screen } from '../test-utils/render';
import { SignatureInput } from './SignatureInput';

jest.mock('signature_pad');

describe('SignatureInput', () => {
  const medplum = new MockClient();

  async function setup(child: ReactNode): Promise<void> {
    await act(async () => {
      render(<MedplumProvider medplum={medplum}>{child}</MedplumProvider>);
    });
  }

  test('Renders', async () => {
    await setup(<SignatureInput onChange={console.log} />);
    expect(screen.getByLabelText('Signature input area')).toBeInTheDocument();
  });
});
