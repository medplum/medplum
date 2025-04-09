# Medplum Zoom Bot Integration

This module integrates Medplum with Zoom, allowing for automatic creation of Zoom meetings and embedding meeting links in FHIR resources. The bot uses Zoom's Server-to-Server OAuth app type for authentication and can create meetings programmatically.

## Prerequisites

1. A Zoom Server-to-Server OAuth app created in Zoom with the following:
   - Account ID
   - Client ID
   - Client Secret
   - User Email (who will be the host of the meeting)

2. The following permissions for your Zoom app:
   - `meeting:write:admin`
   - `meeting:read:admin`

## Setup

1. Add the following secrets to your Project
   ```json
   {
     "ZOOM_ACCOUNT_ID": "your_account_id",
     "ZOOM_CLIENT_ID": "your_client_id",
     "ZOOM_CLIENT_SECRET": "your_client_secret",
     "ZOOM_USER_EMAIL": "your_user_email"
   }
   ```

2. Deploy the bot to your Medplum server

## Usage

The bot can be triggered through Subscription on Appointment resource or invoking the bot directly with an Appointment resource as input.

## Appointment Resource
```
{
  "resourceType": "Appointment",
  "status": "arrived",
  "start": "2025-04-08T23:08:00.000Z",
  "end": "2025-04-08T23:10:00.000Z",
  "minutesDuration": 30,
  "participant": [
    {
      "actor": {
        "reference": "Patient/0194be22-5338-7254-a03c-934f4eed3e5d",
        "display": "Marge Simpson"
      },
      "status": "accepted",
      "required": "information-only",
      "period": {
        "start": "2025-04-08T23:08:00.000Z",
        "end": "2025-04-08T23:09:00.000Z"
      }
    }
  ],
  "id": "019617aa-18cb-7429-871d-53c69189e031",
  ...
}
```

## Response Format

The bot returns a response object containing:

```typescript
{
  meetingUrl: string;      // URL for joining the meeting
  startUrl: string;        // URL for the host to start the meeting
  password: string;        // Meeting password (if enabled)
  joinUrl: string;         // URL for participants to join
  meetingId: string;       // Zoom Meeting ID
}
```

and will update the Appointment resource with the following extensions:

```
{
  ...
  "extension": [
    {
      "url": "https://medplum.com/zoom-meeting",
      "extension": [
        {
          "url": "meetingId",
          "valueString": "74192035879"
        },
        {
          "url": "password",
          "valueString": "pE426Z"
        },
        {
          "url": "startUrl",
          "valueString": "https://us04web.zoom.us/s/74192035879?zak=eyJ0eXAiOiJKV1QiLCJzdiI6IjAwMDAwMSIsInptX3NrbSI6InptX28ybSIsImFsZyI6IkhTMjU2In0.eyJpc3MiOiJ3ZWIiLCJjbHQiOjAsIm1udW0iOiI3NDE5MjAzNTg3OSIsImF1ZCI6ImNsaWVudHNtIiwidWlkIjoicFF0QXZKdHFTcUtuUmkzcFJvaTE2ZyIsInppZCI6ImFkMzI2YWQ5OTdjODQ3NDlhNDg0NTk4MDA3MzAwOTE2Iiwic2siOiIwIiwic3R5IjoxLCJ3Y2QiOiJ1czA0IiwiZXhwIjoxNzQ0MTYxMTY4LCJpYXQiOjE3NDQxNTM5NjgsImFpZCI6IjJZaXRWbjJUVFc2bHlXeWV1WTB4TFEiLCJjaWQiOiIifQ.PeJrxxSqMzm93OxlckJfsvSfM_NtqvsHVRbaA9kk8Bo"
        },
        {
          "url": "joinUrl",
          "valueString": "https://us04web.zoom.us/j/74192035879?pwd=OMj34DYuHSOnPDqHvcYs5pUt9cF7F3.1"
        }
      ]
    }
  ]
}
```

