# Medplum Slack Bot Integration

This project integrates Medplum with Slack, allowing automatic notifications in a Slack channel when certain events occur in Medplum. It uses a Medplum Bot to listen for events and sends corresponding messages to a specified Slack channel.

## Prerequisites

- A Medplum account with bot creation permissions
- A Slack workspace where you have permissions to create apps

## Setup Instructions

### 1. Slack App Setup

1. Go to [Slack API](https://api.slack.com/apps) and click "Create New App".
2. Choose "From scratch", give your app a name, and select your workspace.
3. Under "Add features and functionality", select "Bots".
4. Go to "OAuth & Permissions" in the sidebar.
5. Under "Scopes", add the following Bot Token Scopes:
   - `chat:write`
   - `channels:read`
6. At the top of the "OAuth & Permissions" page, click "Install to Workspace".
7. After installation, you'll see a "Bot User OAuth Token". Save this token; you'll need it later.

### 2. Medplum Bot Setup

1. Log in to your Medplum account.
2. Navigate to the Bot creation page.
3. Create a new bot or select an existing one to edit.
4. In the bot's code editor, paste the contents of the `demo-slack-bot.ts` file.
5. Save the bot code.

For further reference on creating a bot see [Medplum Demo Bots](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots)

### 3. Configure Project Secrets

1. In the [Medplum Project Admin](https://app.medplum.com/admin/project), find the "Secrets" section.
2. Add a new secret with the following details:
   - Key: `SLACK_BOT_TOKEN`
   - Value: The Bot User OAuth Token you saved from the Slack app setup
3. Save the secret configuration.

For further reference on Bot Secrets see [Bot Secrets](https://www.medplum.com/docs/bots/bot-secrets)

### 4. Customize the Slack Channel

In the `handler` function of your bot code, update the `slackChannel` variable to match the name or ID of the Slack channel where you want to receive notifications:

```typescript
const slackChannel = "your-channel-name";
```

### 5. Deploy the Bot

1. Save all changes to your bot in Medplum.
2. Deploy the bot according to Medplum's deployment procedures.

## Usage

Once set up and deployed, the bot will automatically send messages to the specified Slack channel whenever it processes a new resource. The message will include the type of resource that was processed.

## Troubleshooting

- If messages aren't being sent to Slack, check the following:
  - Ensure the `SLACK_BOT_TOKEN` secret is correctly set in Medplum.
  - Verify that the Slack app is installed in your workspace and has the necessary permissions.
  - Check that the specified Slack channel exists and the bot has access to it.
- For more detailed error information, review the bot's logs in Medplum.

## Further Customization

You can modify the `slackMessage` in the `handler` function to customize the content of the Slack notifications based on your specific needs.

## Support

For issues related to Medplum, please refer to the [Medplum documentation](https://www.medplum.com/docs) or contact Medplum support in [Discord](https://discord.gg/medplum)

For Slack-related issues, consult the [Slack API documentation](https://api.slack.com/docs).