# Medplum Zoom Bot Integration

This bot is responsible for creating and updating Zoom meetings. It can be triggered through Subscription on Appointment resource or invoking the bot directly with an Appointment resource as input.

**It takes an Appointment resource as input and returns the updated Appointment resource with the Zoom meeting details added to the extension.**

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

### Example Appointment Resource as Input
```
{
  "resourceType": "Appointment",
  "status": "arrived",
  "start": "2025-04-08T23:08:00.000Z",
  "end": "2025-04-08T23:38:00.000Z",
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

The bot returns the updated Appointment resource with the following extensions:

```typescript
{
  "resourceType": "Appointment",
  ...
  "extension": [
    {
      "url": "https://medplum.com/zoom-meeting",
      "extension": [
        {
          "url": "meetingId",
          "valueString": "meetingId123"
        },
        {
          "url": "password",
          "valueString": "password123&*@%$"
        },
        {
          "url": "startUrl",
          "valueString": "https://us04web.zoom.us/s/74192035[...]M_NtqvsHVRbaA9kk8Bo"
        },
        {
          "url": "joinUrl",
          "valueString": "https://us04web.zoom.us/j/74192035[...]HSOnPDqHvcYs5pUt9cF7F3.1"
        }
      ]
    }
  ]
}
  
```

