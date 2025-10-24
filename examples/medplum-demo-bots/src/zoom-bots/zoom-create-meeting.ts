// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtensionValue } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Appointment, Extension } from '@medplum/fhirtypes';

// Zoom extension URLs
const ZOOM_MEETING_EXTENSION_URL = 'https://medplum.com/zoom';
const ZOOM_MEETING_ID_URL = 'meeting-id';
const ZOOM_MEETING_PASSWORD_URL = 'meeting-password';
const ZOOM_MEETING_START_URL = 'meeting-start-url';
const ZOOM_MEETING_JOIN_URL = 'meeting-join-url';

interface ZoomMeetingInput {
  topic?: string;
  duration?: number;
  startTime?: string;
  timezone?: string;
  password?: boolean;
  settings?: {
    host_video?: boolean;
    participant_video?: boolean;
    join_before_host?: boolean;
    mute_upon_entry?: boolean;
    waiting_room?: boolean;
  };
}

interface ZoomMeetingResponse {
  meetingUrl: string;
  startUrl: string;
  password?: string;
  joinUrl: string;
  meetingId: string;
}

interface ZoomTokenResponse {
  access_token: string;
}

interface ZoomMeetingApiResponse {
  id: string | number;
  join_url: string;
  start_url: string;
  password?: string;
}

/**
 * Gets a Zoom access token using the Server-to-Server OAuth flow
 * @param accountId - Zoom account ID
 * @param clientId - Zoom client ID
 * @param clientSecret - Zoom client secret
 * @returns Access token
 */
async function getZoomAccessToken(accountId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenEndpoint = 'https://zoom.us/oauth/token';

  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  const body = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: accountId,
  }).toString();

  console.log('Requesting Zoom access token with:', {
    endpoint: tokenEndpoint,
    accountId,
    clientId: clientId.substring(0, 4) + '...', // Log partial client ID for security
    body,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: authHeader,
    },
    body,
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Zoom token request failed:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      headers: Object.fromEntries(response.headers.entries()),
    });
    throw new Error(`Failed to get Zoom access token: ${response.statusText}. Details: ${errorData}`);
  }

  const data = (await response.json()) as ZoomTokenResponse;
  console.log('Successfully obtained Zoom access token');
  return data.access_token;
}

/**
 * Creates a Zoom meeting using the Zoom API
 * @param accessToken - Zoom access token
 * @param input - Meeting configuration
 * @param userEmail - Zoom user email
 * @returns Meeting details
 */
async function createZoomMeeting(
  accessToken: string,
  input: ZoomMeetingInput,
  userEmail: string
): Promise<ZoomMeetingResponse> {
  const url = `https://api.zoom.us/v2/users/${userEmail}/meetings`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  console.log('Creating Zoom meeting with:', {
    url,
    userEmail,
    body: {
      ...input,
      settings: input.settings,
    },
  });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: input.topic || 'Medplum Meeting',
      type: 2, //2 for scheduled
      duration: input.duration || 30,
      start_time: input.startTime,
      timezone: input.timezone,
      password: crypto.randomUUID().slice(0, 8),
      settings: {
        host_video: input.settings?.host_video ?? true,
        participant_video: input.settings?.participant_video ?? true,
        join_before_host: input.settings?.join_before_host ?? false,
        mute_upon_entry: input.settings?.mute_upon_entry ?? true,
        waiting_room: input.settings?.waiting_room ?? true,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Zoom API Error:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      headers: Object.fromEntries(response.headers.entries()),
    });
    throw new Error(`Failed to create Zoom meeting: ${response.statusText}. Details: ${errorData}`);
  }

  const meeting = (await response.json()) as ZoomMeetingApiResponse;
  return {
    meetingUrl: meeting.join_url,
    startUrl: meeting.start_url,
    password: meeting.password,
    joinUrl: meeting.join_url,
    meetingId: meeting.id.toString(),
  };
}

/**
 * Updates an existing Zoom meeting using the Zoom API
 * @param accessToken - Zoom access token
 * @param meetingId - Zoom meeting ID
 * @param input - Meeting configuration
 * @returns Meeting details
 */
async function updateZoomMeeting(
  accessToken: string,
  meetingId: string,
  input: ZoomMeetingInput
): Promise<ZoomMeetingResponse> {
  const url = `https://api.zoom.us/v2/meetings/${meetingId}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  console.log('Updating Zoom meeting with:', {
    url,
    body: {
      ...input,
      settings: input.settings,
    },
  });

  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      topic: input.topic || 'Medplum Meeting',
      type: 2, // 2 for scheduled
      duration: input.duration || 30,
      start_time: input.startTime,
      timezone: input.timezone,
      settings: {
        host_video: input.settings?.host_video ?? true,
        participant_video: input.settings?.participant_video ?? true,
        join_before_host: input.settings?.join_before_host ?? false,
        mute_upon_entry: input.settings?.mute_upon_entry ?? true,
        waiting_room: input.settings?.waiting_room ?? true,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Zoom API Error:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      headers: Object.fromEntries(response.headers.entries()),
    });
    throw new Error(`Failed to update Zoom meeting: ${response.statusText}. Details: ${errorData}`);
  }

  // After updating, get the latest meeting details
  const getResponse = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!getResponse.ok) {
    const errorData = await getResponse.text();
    throw new Error(`Failed to get updated meeting details: ${getResponse.statusText}. Details: ${errorData}`);
  }

  const meeting = (await getResponse.json()) as ZoomMeetingApiResponse;
  return {
    meetingUrl: meeting.join_url,
    startUrl: meeting.start_url,
    password: meeting.password,
    joinUrl: meeting.join_url,
    meetingId: meeting.id.toString(),
  };
}

/**
 * Deletes a Zoom meeting using the Zoom API
 * @param accessToken - Zoom access token
 * @param meetingId - Zoom meeting ID
 */
async function deleteZoomMeeting(accessToken: string, meetingId: string): Promise<void> {
  const url = `https://api.zoom.us/v2/meetings/${meetingId}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  console.log('Deleting Zoom meeting: ', url);

  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Zoom API Error:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      headers: Object.fromEntries(response.headers.entries()),
    });
    throw new Error(`Failed to delete Zoom meeting: ${response.statusText}. Details: ${errorData}`);
  }
}

/**
 * Removes Zoom meeting extensions from an appointment
 * @param appointment - Appointment resource
 * @returns Appointment with Zoom extensions removed
 */
function removeZoomExtensions(appointment: Appointment): Appointment {
  return {
    ...appointment,
    extension: appointment.extension?.filter((ext) => ext.url !== ZOOM_MEETING_EXTENSION_URL),
  };
}

/**
 * Updates an Appointment resource with Zoom meeting details
 * @param medplum - Medplum client
 * @param appointment - Appointment resource
 * @param meetingDetails - Zoom meeting details
 * @returns Updated Appointment resource
 */
async function updateAppointmentWithZoomDetails(
  medplum: MedplumClient,
  appointment: Appointment,
  meetingDetails: ZoomMeetingResponse
): Promise<Appointment> {
  // Add Zoom meeting details as extension
  // Remove any existing Zoom extensions
  const extensions: Extension[] = (appointment.extension || []).filter((ext) => ext.url !== ZOOM_MEETING_EXTENSION_URL);
  extensions.push({
    url: ZOOM_MEETING_EXTENSION_URL,
    extension: [
      {
        url: ZOOM_MEETING_ID_URL,
        valueString: meetingDetails.meetingId,
      },
      {
        url: ZOOM_MEETING_PASSWORD_URL,
        valueString: meetingDetails.password || '',
      },
      {
        url: ZOOM_MEETING_START_URL,
        valueString: meetingDetails.startUrl,
      },
      {
        url: ZOOM_MEETING_JOIN_URL,
        valueString: meetingDetails.joinUrl,
      },
    ],
  });
  appointment.extension = extensions;

  return medplum.updateResource(appointment);
}

/**
 * Medplum Bot handler for creating Zoom meetings
 * @param medplum - Medplum client
 * @param event - Bot event
 * @returns Zoom meeting details
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Appointment>): Promise<Appointment> {
  // Get Zoom credentials from bot secrets
  const accountId = event.secrets['ZOOM_ACCOUNT_ID']?.valueString;
  const clientId = event.secrets['ZOOM_CLIENT_ID']?.valueString;
  const clientSecret = event.secrets['ZOOM_CLIENT_SECRET']?.valueString;
  const userEmail = event.secrets['ZOOM_USER_EMAIL']?.valueString;

  if (!accountId || !clientId || !clientSecret || !userEmail) {
    throw new Error('Missing Zoom credentials in bot secrets');
  }

  // Get access token
  const accessToken = await getZoomAccessToken(accountId, clientId, clientSecret);

  const appointment = event.input as Appointment;

  // Check if this is a deletion (status is 'cancelled' or 'noshow')
  const isDeletion = appointment.status === 'cancelled' || appointment.status === 'noshow';

  // Get existing meeting ID if any
  const existingMeetingId = getExtensionValue(appointment, 'https://medplum.com/zoom', 'meeting-id') as string;

  if (isDeletion && existingMeetingId) {
    // Delete the Zoom meeting
    await deleteZoomMeeting(accessToken, existingMeetingId);
    // Remove Zoom extensions from the appointment and update in Medplum
    const cancelledAppointment = removeZoomExtensions(appointment);
    return medplum.updateResource(cancelledAppointment);
  }

  // If not a deletion, proceed with normal meeting creation/update
  if (!appointment.start) {
    throw new Error('Appointment start time is required');
  }

  const meetingInput = {
    topic: appointment.description || 'Medical Appointment',
    startTime: appointment.start,
    duration: appointment.minutesDuration || 30,
    timezone: 'UTC',
  };

  let meetingDetails: ZoomMeetingResponse;
  if (existingMeetingId) {
    // Update existing meeting
    meetingDetails = await updateZoomMeeting(accessToken, existingMeetingId, meetingInput);
  } else {
    // Create new meeting
    meetingDetails = await createZoomMeeting(accessToken, meetingInput, userEmail);
  }

  const updatedAppointment = await updateAppointmentWithZoomDetails(medplum, appointment, meetingDetails);
  return updatedAppointment;
}
