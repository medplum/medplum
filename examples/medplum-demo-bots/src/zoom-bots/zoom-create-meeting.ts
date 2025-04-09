import { BotEvent, MedplumClient } from '@medplum/core';
import { Appointment, Extension } from '@medplum/fhirtypes';

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
    account_id: accountId
  }).toString();

  console.log('Requesting Zoom access token with:', {
    endpoint: tokenEndpoint,
    accountId,
    clientId: clientId.substring(0, 4) + '...', // Log partial client ID for security
    body
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': authHeader
    },
    body
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Zoom token request failed:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      headers: Object.fromEntries(response.headers.entries())
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
async function createZoomMeeting(accessToken: string, input: ZoomMeetingInput, userEmail: string): Promise<ZoomMeetingResponse> {
  const url = `https://api.zoom.us/v2/users/${userEmail}/meetings`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  };

  console.log('Creating Zoom meeting with:', {
    url,
    userEmail,
    headers: {
      ...headers,
      Authorization: 'Bearer [REDACTED]'
    },
    body: {
      ...input,
      settings: input.settings
    }
  });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      topic: input.topic || 'Medplum Meeting',
      type: input.startTime ? 2 : 1, // 1 for instant, 2 for scheduled
      duration: input.duration || 30,
      start_time: input.startTime,
      timezone: input.timezone,
      password: input.password ? Math.random().toString(36).slice(-8) : undefined,
      settings: {
        host_video: input.settings?.host_video ?? true,
        participant_video: input.settings?.participant_video ?? true,
        join_before_host: input.settings?.join_before_host ?? false,
        mute_upon_entry: input.settings?.mute_upon_entry ?? true,
        waiting_room: input.settings?.waiting_room ?? true,
      },
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('Zoom API Error:', {
      status: response.status,
      statusText: response.statusText,
      errorData,
      headers: Object.fromEntries(response.headers.entries())
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
  const extensions: Extension[] = appointment.extension || [];
  extensions.push({
    url: 'https://medplum.com/zoom-meeting',
    extension: [
      {
        url: 'meetingId',
        valueString: meetingDetails.meetingId,
      },
      {
        url: 'password',
        valueString: meetingDetails.password || '',
      },
      {
        url: 'startUrl',
        valueString: meetingDetails.startUrl,
      },
      {
        url: 'joinUrl',
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
export async function handler(
  medplum: MedplumClient,
  event: BotEvent< Appointment>
): Promise<Appointment> {
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

  // Handle different input types
   const appointment = event.input as Appointment;

   const meetingInput = {
      topic: appointment.description || 'Medical Appointment',
      startTime: appointment.start,
      duration: appointment.minutesDuration || 30,
    };

  // Create Zoom meeting
  const meetingDetails = await createZoomMeeting(accessToken, meetingInput, userEmail);

  const updatedAppointment = await updateAppointmentWithZoomDetails(medplum, appointment, meetingDetails);
  return updatedAppointment;
} 