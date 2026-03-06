// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconDots,
  IconMaximize,
  IconMessageCircle,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhone,
  IconRecordMail,
  IconScreenShare,
  IconSettings,
  IconUsers,
  IconVideo,
  IconVideoOff,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useAppsPanel } from './AppsPanelContext';

function getPatientIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/Patient\/([^/]+)/);
  return match?.[1];
}

function VideoPlaceholder({ name, large }: { readonly name: string; readonly large?: boolean }): JSX.Element {
  const initials = name
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Box
      style={{
        background: large
          ? 'linear-gradient(135deg, #1a1b2e 0%, #16213e 50%, #0f3460 100%)'
          : 'linear-gradient(135deg, #2d3436 0%, #636e72 100%)',
        borderRadius: 8,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        minHeight: large ? 200 : 80,
      }}
    >
      <Avatar size={large ? 'xl' : 'md'} radius="xl" color={large ? 'blue' : 'teal'} variant="filled">
        {initials}
      </Avatar>
      <Text size={large ? 'sm' : 'xs'} c="white" mt={6} fw={500}>
        {name}
      </Text>
      {large && (
        <Badge
          size="xs"
          color="green"
          variant="filled"
          style={{ position: 'absolute', top: 8, left: 8 }}
          leftSection={<Box w={6} h={6} style={{ borderRadius: '50%', background: '#4ade80' }} />}
        >
          Connected
        </Badge>
      )}
      {!large && (
        <Box
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#4ade80',
            border: '1.5px solid rgba(0,0,0,0.3)',
          }}
        />
      )}
    </Box>
  );
}

function VideoControls({
  muted,
  videoOff,
  onToggleMute,
  onToggleVideo,
}: {
  readonly muted: boolean;
  readonly videoOff: boolean;
  readonly onToggleMute: () => void;
  readonly onToggleVideo: () => void;
}): JSX.Element {
  return (
    <Paper
      py="xs"
      px="md"
      radius="md"
      style={{
        background: 'rgba(30, 30, 40, 0.95)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <Group justify="center" gap="xs">
        <Tooltip label={muted ? 'Unmute' : 'Mute'} position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color={muted ? 'red' : 'gray.7'} onClick={onToggleMute}>
            {muted ? <IconMicrophoneOff size={18} /> : <IconMicrophone size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={videoOff ? 'Start Video' : 'Stop Video'} position="top">
          <ActionIcon
            size="lg"
            radius="xl"
            variant="filled"
            color={videoOff ? 'red' : 'gray.7'}
            onClick={onToggleVideo}
          >
            {videoOff ? <IconVideoOff size={18} /> : <IconVideo size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Share Screen" position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color="gray.7">
            <IconScreenShare size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Chat" position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color="gray.7">
            <IconMessageCircle size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Participants" position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color="gray.7">
            <IconUsers size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Record" position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color="gray.7">
            <IconRecordMail size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="More" position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color="gray.7">
            <IconDots size={18} />
          </ActionIcon>
        </Tooltip>
        <Divider orientation="vertical" color="gray.7" mx={4} />
        <Tooltip label="End Call" position="top">
          <ActionIcon size="lg" radius="xl" variant="filled" color="red">
            <IconPhone size={18} style={{ transform: 'rotate(135deg)' }} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Paper>
  );
}

function ActiveCallView({ panelMaximized }: { readonly panelMaximized: boolean }): JSX.Element {
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleVideo = useCallback(() => setVideoOff((v) => !v), []);

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f0f14',
        borderRadius: 0,
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <Group justify="space-between" px="sm" py={6} style={{ background: 'rgba(0,0,0,0.3)' }}>
        <Group gap={6}>
          <ThemeIcon size={18} radius="sm" color="blue" variant="filled">
            <IconVideo size={11} />
          </ThemeIcon>
          <Text size="xs" c="white" fw={500}>
            Video Visit
          </Text>
          <Badge size="xs" color="green" variant="dot">
            In Progress
          </Badge>
        </Group>
        <Group gap={4}>
          <Text size="xs" c="gray.5" ff="monospace">
            12:34
          </Text>
          <ActionIcon size="xs" variant="subtle" color="gray.5">
            <IconMaximize size={12} />
          </ActionIcon>
          <ActionIcon size="xs" variant="subtle" color="gray.5">
            <IconSettings size={12} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Video area */}
      <Box style={{ flex: 1, position: 'relative', display: 'flex', padding: 8, gap: 8 }}>
        {/* Main (patient) video */}
        <Box style={{ flex: 1, position: 'relative' }}>
          <VideoPlaceholder name="Sarah Johnson" large />
        </Box>

        {/* Self-view + additional participants */}
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: panelMaximized ? 160 : 100,
            flexShrink: 0,
          }}
        >
          <Box style={{ flex: 1 }}>
            <VideoPlaceholder name="Dr. Smith" />
          </Box>
        </Box>
      </Box>

      {/* Controls */}
      <Box px="sm" pb="sm" pt={4}>
        <VideoControls muted={muted} videoOff={videoOff} onToggleMute={toggleMute} onToggleVideo={toggleVideo} />
      </Box>
    </Box>
  );
}

export function TelehealthContent(): JSX.Element {
  const location = useLocation();
  const { panelMaximized } = useAppsPanel();
  const patientId = getPatientIdFromPathname(location.pathname);
  const [inCall, setInCall] = useState(true);

  if (inCall) {
    return <ActiveCallView panelMaximized={panelMaximized} />;
  }

  return (
    <Center style={{ flex: 1 }}>
      <Stack align="center" gap="md" mx="xl">
        <ThemeIcon size={56} radius="xl" color="blue" variant="light">
          <IconVideo size={30} />
        </ThemeIcon>
        <Text size="sm" fw={500} ta="center">
          {patientId ? 'Start a video visit with this patient' : 'Open a patient chart to start a video visit'}
        </Text>
        {patientId && (
          <Button leftSection={<IconVideo size={16} />} onClick={() => setInCall(true)}>
            Start Video Visit
          </Button>
        )}
      </Stack>
    </Center>
  );
}
