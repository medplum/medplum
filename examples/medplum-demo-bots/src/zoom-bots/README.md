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

## Integration with FHIR Resources

The bot can update various FHIR resources with the Zoom meeting details:

- Appointment.telecom
- Appointment.extension
- ServiceRequest.orderDetail
- Communication.payload

## Error Handling

The bot implements comprehensive error handling for various scenarios:
- Invalid authentication
- Rate limiting
- Network issues
- Invalid meeting parameters

See the implementation file for detailed error handling logic.

## Testing

See `zoom-create-meeting.test.ts` for comprehensive test cases covering:
- Meeting creation
- Error scenarios
- FHIR resource updates
- Authentication flows 