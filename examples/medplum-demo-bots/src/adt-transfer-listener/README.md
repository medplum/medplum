# ADT Transfer Listener

Processes ADT (Admit, Discharge, Transfer) HL7 messages from SFTP sources and converts them to FHIR resources.

## Files

- **`adt-sftp-listener.ts`** - SFTP listener that reads `.adt` files and creates FHIR bundles
- **`adt-transfer-bot.ts`** - Direct HL7 message processor for real-time ADT handling
- **`adt-sftp-listener.test.ts`** - Unit tests for SFTP listener
- **`adt-transfer-bot.test.ts`** - Unit tests for transfer bot

## Features

### SFTP Listener

- Connects to SFTP server with SSH key authentication and retry logic
- Processes ADT A01 (Admit) and A08 (Update) messages from `.adt` files
- Creates FHIR resources: MessageHeader, Patient, Encounter, AllergyIntolerance, Practitioner
- Batch processing with individual message error handling

### Transfer Bot

- Processes direct HL7 ADT messages (A01, A08, A30)
- Creates/updates Patient and Encounter resources
- Returns HL7 ACK responses

## Configuration

Required secrets:

- `SFTP_HOST` - SFTP server hostname
- `SFTP_USER` - SFTP username
- `SFTP_PRIVATE_KEY` - SSH private key

SFTP settings: 5 retries with exponential backoff, reads from 'adt' directory.

## Testing

```bash
npm test
```

Tests cover SFTP file processing, HL7 message handling, error scenarios, and use MockClient for isolation.
