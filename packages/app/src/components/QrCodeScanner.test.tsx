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

  function setMediaDevices(getUserMedia: ReturnType<typeof vi.fn> | undefined): void {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: getUserMedia ? { getUserMedia } : undefined,
    });
  }

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
    setMediaDevices(vi.fn().mockRejectedValue(error));

    render(<QrCodeScanner onScan={vi.fn()} onError={onError} />);

    expect(await screen.findByText('Permission denied')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(error);
  });

  test('shows unsupported browser errors', async () => {
    const onError = vi.fn();
    setMediaDevices(undefined);

    render(<QrCodeScanner onScan={vi.fn()} onError={onError} />);

    expect(await screen.findByText('Camera access is not available in this browser.')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(new Error('Camera access is not available in this browser.'));
  });

  test('shows non-error camera failures', async () => {
    const onError = vi.fn();
    setMediaDevices(vi.fn().mockRejectedValue('No camera'));

    render(<QrCodeScanner onScan={vi.fn()} onError={onError} />);

    expect(await screen.findByText('No camera')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith(new Error('No camera'));
  });

  test('does not start camera when canvas context is unavailable', () => {
    const getUserMedia = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    setMediaDevices(getUserMedia);

    render(<QrCodeScanner onScan={vi.fn()} />);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText('Loading camera...')).toBeInTheDocument();
  });

  test('scans a QR code once and stops the camera stream', async () => {
    const stop = vi.fn();
    const onScan = vi.fn();
    setMediaDevices(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }));
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
      rafCallback?.(400);
    });

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(jsQRMock).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 1, 1, { inversionAttempts: 'attemptBoth' });
    expect(onScan).toHaveBeenCalledWith('shc:/123');
    expect(stop).toHaveBeenCalled();
  });

  test('continues scanning when scanOnce is false', async () => {
    const stop = vi.fn();
    const onScan = vi.fn();
    setMediaDevices(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }));
    jsQRMock.mockReturnValue({ data: 'shc:/123' } as ReturnType<typeof jsQR>);

    const { container } = render(<QrCodeScanner onScan={onScan} scanOnce={false} />);
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

    expect(onScan).toHaveBeenCalledWith('shc:/123');
    expect(stop).not.toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  test('stops camera stream when unmounted after startup', async () => {
    const stop = vi.fn();
    setMediaDevices(vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }));

    const { unmount } = render(<QrCodeScanner onScan={vi.fn()} />);

    await waitFor(() => expect(rafCallback).toBeDefined());
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(stop).toHaveBeenCalled();
  });

  test('stops camera stream when getUserMedia resolves after unmount', async () => {
    const stop = vi.fn();
    let resolveGetUserMedia: (stream: { getTracks: () => { stop: ReturnType<typeof vi.fn> }[] }) => void = () => undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise<{ getTracks: () => { stop: ReturnType<typeof vi.fn> }[] }>((resolve) => {
          resolveGetUserMedia = resolve;
        })
    );
    setMediaDevices(getUserMedia);

    const { unmount } = render(<QrCodeScanner onScan={vi.fn()} />);
    unmount();
    await act(async () => {
      resolveGetUserMedia({ getTracks: () => [{ stop }] });
    });

    expect(stop).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
