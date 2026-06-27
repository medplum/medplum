// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import jsQR from 'jsqr';
import { act, render, screen, waitFor } from '../test-utils/render';
import { QrCodeScanner } from './QrCodeScanner';

vi.mock('jsqr', () => ({
  default: vi.fn(),
}));

describe('QrCodeScanner', () => {
  const jsQRMock = vi.mocked(jsQR);
  let rafCallback: FrameRequestCallback | undefined;
  let drawImage: ReturnType<typeof vi.fn>;
  let getImageData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rafCallback = undefined;
    drawImage = vi.fn();
    getImageData = vi.fn().mockReturnValue({
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafCallback = callback;
        return 1;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('shows permission denied errors', async () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';
    const onError = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(error) },
    });

    render(<QrCodeScanner onScan={vi.fn()} onError={onError} />);

    expect(await screen.findByText('Camera permission was denied.')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(error);
  });

  test('scans a QR code once and stops the camera stream', async () => {
    const stop = vi.fn();
    const onScan = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    });
    jsQRMock.mockReturnValue({ data: 'shc:/123' } as ReturnType<typeof jsQR>);

    const { container } = render(<QrCodeScanner onScan={onScan} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperties(video, {
      HAVE_ENOUGH_DATA: { configurable: true, value: 4 },
      readyState: { configurable: true, value: 4 },
      videoHeight: { configurable: true, value: 480 },
      videoWidth: { configurable: true, value: 640 },
    });

    await waitFor(() => expect(rafCallback).toBeDefined());
    await act(async () => {
      rafCallback?.(200);
    });

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(jsQRMock).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 1, 1, { inversionAttempts: 'attemptBoth' });
    expect(onScan).toHaveBeenCalledWith('shc:/123');
    expect(stop).toHaveBeenCalled();
  });
});
