// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications } from '@mantine/notifications';
import { allOk, badRequest, ContentType, encodeSmartHealthLink, getReferenceString } from '@medplum/core';
import type { Practitioner } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { Form } from '../Form/Form';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { PatientExportFormProps } from './PatientExportForm';
import { PatientExportForm } from './PatientExportForm';
import { renderSmartHealthLinkCard } from './SmartHealthLinkCard';

vi.mock('./SmartHealthLinkCard', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  renderSmartHealthLinkCard: vi.fn(),
}));

function captureDownloads(): HTMLAnchorElement[] {
  const anchors: HTMLAnchorElement[] = [];
  vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLAnchorElement) {
      anchors.push(node);
    }
    return Node.prototype.appendChild.call(document.body, node) as T;
  });
  return anchors;
}

const QR_CODE = 'data:image/png;base64,iVBORw0KGgo=';

function mockGenerate(medplum: MockClient, shlink: string, qrCodeDataUrl = QR_CODE): ReturnType<typeof vi.spyOn> {
  medplum.router.add('POST', '/Patient/:id/$generate-smart-health-link', async () => [
    allOk,
    {
      resourceType: 'Parameters',
      parameter: [
        { name: 'shlink', valueString: shlink },
        { name: 'qrCodeDataUrl', valueString: qrCodeDataUrl },
      ],
    },
  ]);
  return vi.spyOn(medplum, 'post');
}

async function click(role: 'tab' | 'button', name: string | RegExp): Promise<void> {
  const element = await screen.findByRole(role, { name });
  await act(async () => {
    fireEvent.click(element);
  });
}

describe('PatientExportForm', () => {
  beforeEach(() => {
    vi.mocked(renderSmartHealthLinkCard).mockReset().mockResolvedValue(undefined);
  });

  async function setup(args: PatientExportFormProps, medplum = new MockClient()): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <Notifications />
          <PatientExportForm {...args} />
        </MedplumProvider>
      );
    });
  }

  beforeAll(() => {
    // Mock URL.createObjectURL
    URL.createObjectURL = vi.fn();
    URL.revokeObjectURL = vi.fn();

    // Mock document.createEvent
    type MyDocument = typeof document & {
      originalCreateElement: (tagName: string, options?: ElementCreationOptions) => any;
    };

    // Save the original createElement function
    (document as MyDocument).originalCreateElement = document.createElement;

    // Create a wrapper function
    document.createElement = (tagName: string, options?: ElementCreationOptions): any => {
      const result = (document as MyDocument).originalCreateElement(tagName, options);
      if (tagName === 'a') {
        // jsdom does not support click() or download attributes, so we will implement them here
        result.click = vi.fn();
      }
      return result;
    };
  });

  test('Renders', async () => {
    await setup({ patient: HomerSimpson });

    const button = await screen.findByText('Export Homer Simpson’s Records');
    expect(button).toBeInTheDocument();
  });

  test('Submit', async () => {
    // Mock the patient everything endpoint
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$everything', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);

    await setup({ patient: HomerSimpson }, medplum);

    const button = await screen.findByText('Export Homer Simpson’s Records');
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    const exporting = await screen.findByText('Patient Export');
    expect(exporting).toBeInTheDocument();

    const done = await screen.findByText('Done');
    expect(done).toBeInTheDocument();
  });

  test('Includes attachment files in a FHIR Everything export', async () => {
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$everything', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);
    const postSpy = vi.spyOn(medplum, 'post');
    await setup({ patient: HomerSimpson }, medplum);

    expect(screen.getByText('Attachments')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('Include Files in Export'));
    });
    await click('button', 'Export Homer Simpson’s Records');

    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect((postSpy.mock.calls[0][0] as URL).searchParams.get('_inlineAttachments')).toBe('true');
  });

  test('Defaults the author to the current user and authored on to today', async () => {
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$everything', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);
    const postSpy = vi.spyOn(medplum, 'post');
    await setup({ patient: HomerSimpson }, medplum);

    const now = new Date();
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0'));
    expect(screen.getByPlaceholderText('Authored on')).toHaveValue(today.join('-'));
    expect(screen.getByPlaceholderText('Authored on')).toHaveAttribute('max', today.join('-'));
    await click('button', 'Export Homer Simpson’s Records');

    expect(await screen.findByText('Done')).toBeInTheDocument();
    const params = postSpy.mock.calls[0][1] as { author: { reference: string }; authoredOn: string };
    expect(params.author.reference).toBe(getReferenceString(medplum.getProfile() as Practitioner));
    expect(Math.abs(new Date(params.authoredOn).getTime() - Date.now())).toBeLessThan(60_000);
  });

  test('Submit with whole-day start, end, and authored on dates', async () => {
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$everything', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);
    const postSpy = vi.spyOn(medplum, 'post');
    await setup({ patient: HomerSimpson }, medplum);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Authored on'), { target: { value: '2024-06-01' } });
      fireEvent.change(screen.getByPlaceholderText('Start date'), { target: { value: '2020-01-01' } });
      fireEvent.change(screen.getByPlaceholderText('End date'), { target: { value: '2020-01-31' } });
    });
    await click('button', 'Export Homer Simpson’s Records');

    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authoredOn: new Date(2024, 5, 1).toISOString(),
        start: new Date(2020, 0, 1).toISOString(),
        end: new Date(2020, 1, 1).toISOString(),
      }),
      undefined,
      expect.anything()
    );
  });

  test('Exports a C-CDA Referral Note', async () => {
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$ccda-export', async () => [
      allOk,
      { resourceType: 'Bundle', type: 'document' },
    ]);
    const postSpy = vi.spyOn(medplum, 'post');
    await setup({ patient: HomerSimpson }, medplum);

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'C-CDA' }));
    });
    expect(screen.queryByRole('tab', { name: 'C-CDA Referral' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Referral Note'));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export Homer Simpson’s Records' }));
    });

    expect(await screen.findByText('Done')).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.stringContaining('$ccda-export') }),
      expect.objectContaining({ type: 'referral' }),
      undefined,
      expect.anything()
    );
  });

  test('Renders pieces through children', async () => {
    await setup({
      patient: HomerSimpson,
      children: ({ body, actions, onSubmit }) => (
        <Form onSubmit={onSubmit}>
          <div data-testid="custom-body">{body}</div>
          <div data-testid="custom-actions">{actions}</div>
        </Form>
      ),
    });

    expect(screen.getByTestId('custom-body')).toHaveTextContent('FHIR Everything');
    expect(screen.getByTestId('custom-actions')).toHaveTextContent('Export Homer Simpson’s Records');
  });

  test('Shows the SMART Health Card/Link tab', async () => {
    await setup({ patient: HomerSimpson });
    await click('tab', 'SMART Health Card/Link');
    expect(await screen.findByRole('button', { name: /^Generate .*SMART Health Card\/Link$/ })).toBeInTheDocument();
  });

  test('Generates a SMART Health Link and card', async () => {
    const shlink = encodeSmartHealthLink({
      url: 'https://example.com/shl/123/manifest',
      key: 'testkey',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const medplum = new MockClient();
    const postSpy = mockGenerate(medplum, shlink);
    vi.mocked(renderSmartHealthLinkCard).mockResolvedValue(new Blob(['card'], { type: 'image/png' }));
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:card');
    await setup({ patient: HomerSimpson }, medplum);

    await click('tab', 'SMART Health Card/Link');
    await click('button', /Generate/);

    expect(postSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'direct', passcode: undefined, includeQrCode: true }),
      ContentType.JSON
    );
    const { exp } = postSpy.mock.calls[0][1] as { exp: number };
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60 * 60);

    expect(await screen.findByText(shlink)).toBeInTheDocument();
    expect(screen.getByText('SMART Health Card')).toBeInTheDocument();
    expect(screen.getByText('SMART Health Link')).toBeInTheDocument();
    expect(screen.getByText(/^This SMART Health Card\/Link expires on .+ at .+$/)).toBeInTheDocument();
    const cardImage = screen.getByAltText('SMART Health Card');
    expect(cardImage).toHaveAttribute('src', 'blob:card');
    expect(cardImage).toHaveStyle({ opacity: '0' });
    expect(document.querySelector('.mantine-Skeleton-root')).toBeInTheDocument();
    await act(async () => {
      fireEvent.load(cardImage);
    });
    expect(cardImage).not.toHaveStyle({ opacity: '0' });
    expect(document.querySelector('.mantine-Skeleton-root')).not.toBeInTheDocument();
    expect(renderSmartHealthLinkCard).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Homer Simpson’s Health Records',
        expires: expect.stringMatching(/^This SMART Health Card expires on .+ at .+$/),
        qrCodeDataUrl: QR_CODE,
      })
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await click('button', 'Copy Link');
    expect(writeText).toHaveBeenCalledWith(shlink);
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    vi.unstubAllGlobals();

    const downloads = captureDownloads();
    await click('button', 'Download Card');
    expect(screen.getByRole('button', { name: 'Download Started' })).toBeInTheDocument();
    expect(downloads.at(-1)?.href).toBe('blob:card');
    expect(downloads.at(-1)?.download).toBe('Homer Simpson’s Health Records.png');

    expect(screen.queryByLabelText('Label')).not.toBeInTheDocument();
    await click('button', 'New SMART Health Card/Link');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card');
    expect(screen.queryByText(shlink)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
  });

  test('Falls back to the bare QR code without a card', async () => {
    const medplum = new MockClient();
    mockGenerate(medplum, encodeSmartHealthLink({ url: 'https://example.com/shl/1/payload', key: 'k' }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(renderSmartHealthLinkCard).mockRejectedValue(new Error('no canvas'));
    await setup({ patient: HomerSimpson }, medplum);

    await click('tab', 'SMART Health Card/Link');
    await click('button', /Generate/);

    expect(await screen.findByAltText('SMART Health Link QR code')).toHaveAttribute('src', QR_CODE);
    expect(consoleError).toHaveBeenCalled();
    const downloads = captureDownloads();
    await click('button', 'Download Card');
    expect(downloads.at(-1)?.href).toBe(QR_CODE);
  });

  test('Generates a manifest SMART Health Link when a passcode is set', async () => {
    const medplum = new MockClient();
    const postSpy = mockGenerate(
      medplum,
      encodeSmartHealthLink({ url: 'https://example.com/shl/1/manifest', key: 'k', flag: 'P' })
    );
    await setup({ patient: HomerSimpson }, medplum);

    await click('tab', 'SMART Health Card/Link');
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Passcode/), { target: { value: 'secret' } });
      fireEvent.change(screen.getByLabelText(/Expires/), { target: { value: String(7 * 24 * 60 * 60) } });
    });
    await click('button', /Generate/);

    expect(postSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'manifest', passcode: 'secret' }),
      ContentType.JSON
    );
    const { exp } = postSpy.mock.calls[0][1] as { exp: number };
    expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(7 * 24 * 60 * 60 - 60);
  });

  test('Shows an error when SMART Health Link generation fails', async () => {
    const medplum = new MockClient();
    medplum.router.add('POST', '/Patient/:id/$generate-smart-health-link', async () => [
      badRequest('Generation failed'),
    ]);
    await setup({ patient: HomerSimpson }, medplum);

    await click('tab', 'SMART Health Card/Link');
    await click('button', /Generate/);

    expect(await screen.findByText('Generation failed')).toBeInTheDocument();
  });

  test('Uses a bare apostrophe for names ending in s', async () => {
    await setup({ patient: { resourceType: 'Patient', id: 'frodo', name: [{ given: ['Frodo'], family: 'Baggins' }] } });
    expect(await screen.findByRole('button', { name: 'Export Frodo Baggins’ Records' })).toBeInTheDocument();

    await click('tab', 'SMART Health Card/Link');
    expect(screen.getByRole('button', { name: 'Generate Frodo Baggins’ SMART Health Card/Link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toHaveValue('Frodo Baggins’ Health Records');
  });
});
