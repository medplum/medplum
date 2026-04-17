// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import {
  MediaDeviceMenu,
  TrackToggle,
  useLocalParticipant,
  VideoTrack,
} from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import { BackgroundBlur, VirtualBackground, supportsBackgroundProcessors } from '@livekit/track-processors';
import { isLocalTrack, Track } from 'livekit-client';

import officeJpg from '../assets/backgrounds/office.jpg';
import natureJpg from '../assets/backgrounds/nature.jpg';

const BACKGROUND_IMAGES: readonly { readonly name: string; readonly path: string }[] = [
  { name: 'Office', path: officeJpg },
  { name: 'Nature', path: natureJpg },
];

type BackgroundType = 'none' | 'blur' | 'image';

/**
 * Camera device controls, preview, and optional background effects (blur / virtual background).
 * Modeled after LiveKit Meet's CameraSettings.
 *
 * @returns The camera settings panel.
 */
export function CameraSettings(): React.JSX.Element {
  const { cameraTrack, localParticipant } = useLocalParticipant();
  const bgSupported = React.useMemo(() => supportsBackgroundProcessors(), []);

  const [backgroundType, setBackgroundType] = React.useState<BackgroundType>('none');

  const [virtualBackgroundImagePath, setVirtualBackgroundImagePath] = React.useState<string | null>(null);

  const camTrackRef: TrackReference | undefined = React.useMemo(() => {
    return cameraTrack
      ? { participant: localParticipant, publication: cameraTrack, source: Track.Source.Camera }
      : undefined;
  }, [localParticipant, cameraTrack]);

  const selectBackground = (type: BackgroundType, imagePath?: string): void => {
    setBackgroundType(type);
    if (type === 'image' && imagePath) {
      setVirtualBackgroundImagePath(imagePath);
    } else if (type !== 'image') {
      setVirtualBackgroundImagePath(null);
    }
  };

  React.useEffect(() => {
    if (!isLocalTrack(cameraTrack?.track)) {
      return;
    }
    const track = cameraTrack.track;
    if (backgroundType === 'blur') {
      track?.setProcessor(BackgroundBlur())?.catch(() => undefined);
    } else if (backgroundType === 'image' && virtualBackgroundImagePath) {
      track?.setProcessor(VirtualBackground(virtualBackgroundImagePath))?.catch(() => undefined);
    } else {
      track?.stopProcessor()?.catch(() => undefined);
    }
  }, [cameraTrack, backgroundType, virtualBackgroundImagePath]);

  return (
    <section style={{ marginBottom: '1rem' }}>
      {camTrackRef && (
        <div style={{ marginBottom: '0.75rem', borderRadius: 8, overflow: 'hidden', maxWidth: 320 }}>
          <VideoTrack trackRef={camTrackRef} />
        </div>
      )}

      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Camera</h3>
      <span className="lk-button-group">
        <TrackToggle source={Track.Source.Camera} />
        <span className="lk-button-group-menu">
          <MediaDeviceMenu kind="videoinput" />
        </span>
      </span>

      {bgSupported && (
        <>
          <h4 style={{ fontSize: '0.75rem', fontWeight: 600, margin: '1rem 0 0.5rem' }}>Background effects</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="lk-button"
              aria-pressed={backgroundType === 'none'}
              onClick={() => selectBackground('none')}
              style={{
                border: backgroundType === 'none' ? '2px solid #0090ff' : '1px solid #d1d1d1',
                minWidth: 80,
              }}
            >
              None
            </button>
            <button
              type="button"
              className="lk-button"
              aria-pressed={backgroundType === 'blur'}
              onClick={() => selectBackground('blur')}
              style={{
                border: backgroundType === 'blur' ? '2px solid #0090ff' : '1px solid #d1d1d1',
                minWidth: 80,
                minHeight: 60,
              }}
            >
              Blur
            </button>
            {BACKGROUND_IMAGES.map((image) => (
              <button
                key={image.path}
                type="button"
                className="lk-button"
                aria-pressed={backgroundType === 'image' && virtualBackgroundImagePath === image.path}
                onClick={() => selectBackground('image', image.path)}
                style={{
                  backgroundImage: `url(${image.path})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  width: 80,
                  height: 60,
                  border:
                    backgroundType === 'image' && virtualBackgroundImagePath === image.path
                      ? '2px solid #0090ff'
                      : '1px solid #d1d1d1',
                  color: '#fff',
                  textShadow: '0 1px 2px #000',
                }}
              >
                {image.name}
              </button>
            ))}
          </div>
        </>
      )}
      {!bgSupported && (
        <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>
          Background effects are not supported in this browser.
        </p>
      )}
    </section>
  );
}
