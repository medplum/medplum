// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export {
  AiAgentIndicator,
  CameraSettings,
  ChatDrawer,
  EndCallScreen,
  KeyboardShortcuts,
  MeetControlBar,
  MeetLayout,
  MicrophoneSettings,
  ParticipantView,
  ParticipantsDrawer,
  PatientVideoVisitPage,
  SettingsMenu,
  UpcomingVideoVisits,
  VideoControls,
  VideoLobby,
  VideoRoom,
  WaitingRoom,
} from './components';

export type {
  ChatDrawerProps,
  EndCallScreenProps,
  MeetControlBarProps,
  MeetLayoutProps,
  ParticipantsDrawerProps,
  PatientVideoVisitPageProps,
  SettingsMenuProps,
  UpcomingVideoVisitsProps,
  VideoControlsProps,
  VideoLobbyProps,
  VideoRoomProps,
  WaitingRoomProps,
} from './components';

export { useVideoVisit } from './hooks/useVideoVisit';
export { useLiveKitToken } from './hooks/useLiveKitToken';
export { useEncounterSync } from './hooks/useEncounterSync';
export { useAiAgentStatus } from './hooks/useAiAgentStatus';
export { usePerformanceOptimizer } from './hooks/usePerformanceOptimizer';

export type { UseVideoVisitReturn } from './hooks/useVideoVisit';
export type { PerformanceOptimizerOptions } from './hooks/usePerformanceOptimizer';
export type { TranscriptChunk } from './hooks/useEncounterSync';
export type { LocalUserChoices } from '@livekit/components-core';

export { EXT } from './utils/livekit-config';
export {
  getEncounterRoomName,
  getWaitingRoomStatus,
  getWaitingRoomJoinedAt,
  getVisitMode,
  isVideoEncounter,
  isJoinable,
} from './utils/fhir-mappers';
