# Resource Usage Report Bot

This bot generates a comprehensive resource usage report for the current Medplum project and sends it via email as a CSV attachment.

## Features

- **Comprehensive Coverage**: Counts all FHIR resource types (150+ types)
- **CSV Export**: Generates an Excel-compatible CSV file
- **Email Delivery**: Automatically emails the report to a configured recipient

## Prerequisites

### 1. Admin Access Required

This bot needs to run with **admin privileges** to access resource counts across the entire project.

To configure the bot as an admin bot:

1. Navigate to [app.medplum.com/admin/bots](https://app.medplum.com/admin/bots)
2. Select your resource usage bot
3. Check the "Run as Admin" option
4. Save the configuration

### 2. Email Feature Enabled

Your project must have the **email feature enabled** to send the CSV report. Contact your Medplum administrator if you need email functionality enabled for your project.

## Configuration

Update the `REPORT_EMAIL` constant at the top of `resource-usage.ts` with your desired email address:

```typescript
const REPORT_EMAIL = 'admin@example.com';
```

## CSV Report Format

The generated CSV includes:

- **Project Information**: Project name and ID
- **Generation Timestamp**: When the report was created
- **Resource Counts**: A table with each resource type and its count in the project

**Note**: Resource types are sorted by count in descending order, so the most populated resources appear first.

Example output:

```csv
Project,My Healthcare Project
Generated,2025-09-30T12:00:00.000Z

Resource Type,Count
Observation,3240
Patient,150
Practitioner,25
...
```

## Usage

This bot can be triggered in several ways:

- **Manually**: Execute the bot from the Medplum console
- **Scheduled (Recommended)**: [Set up a cron](https://www.medplum.com/docs/bots/bot-cron-job) to run automatically (e.g., weekly/monthly reports)
- **API**: Call via the bot execute endpoint

### Recommended: Run on a Cron Schedule

For regular reporting (e.g., weekly or monthly), we recommend setting up a cron-based subscription to automatically trigger the bot.

To set up a scheduled execution:

1. Create a `Subscription` resource with a cron trigger
2. Configure the schedule (e.g., `0 0 * * 1` for weekly on Mondays at midnight)
3. Set the bot as the subscription endpoint

For detailed instructions, see the [Medplum Bots on Cron documentation](https://www.medplum.com/docs/bots/cron).

## How It Works

1. **Project Detection**: Reads the bot's metadata to determine which project it's running in
2. **Batch Query**: Creates a FHIR batch bundle with count queries for all resource types
3. **Data Processing**: Extracts counts from the batch response
4. **Sorting**: Sorts resource types by count in descending order
5. **CSV Generation**: Formats the data as a CSV with headers and project information
6. **Email Delivery**: Uses Medplum's email API to send the report as an attachment

## Example Bot Execution

```typescript
await medplum.executeBot({ reference: 'Bot/resource-usage-bot-id' }, {});
```

## Return Value

The bot returns a success object:

```typescript
{
  success: true;
}
```
