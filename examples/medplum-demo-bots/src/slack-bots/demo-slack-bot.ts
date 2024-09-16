import { BotEvent, MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';



const sendSlackMessage = async (text: string, slackBotToken: string, slackChannel: string): Promise<void> => {
 

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${slackBotToken}`,
    },
    body: JSON.stringify({ channel: slackChannel, text }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send Slack message: ${response.statusText}`);
  }
};

export const handler = async (medplum: MedplumClient, event: BotEvent<Resource>): Promise<any> => {
  const slackBotToken = event.secrets['SLACK_BOT_TOKEN'].valueString;
  const slackChannel = "general";

  if (!slackBotToken) {
    throw new Error('Slack configuration is missing');
  }

  const resource = event.input;
  console.log(`Hello ${resource.resourceType}!`);
  const slackMessage = `Hello ${resource.resourceType}`;

  try {
    await sendSlackMessage(slackMessage, slackBotToken, slackChannel);
    return { statusCode: 200, body: JSON.stringify({ status: 'Message sent to Slack' }) };
  } catch (error) {
    console.error('Error sending message to Slack:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send message to Slack' }) };
  }
};