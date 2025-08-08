// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Medplum Slack Bot
 *
 * This module integrates Medplum with Slack, allowing for automatic notifications
 * in a Slack channel when certain events occur in Medplum. It uses a Medplum Bot
 * to listen for events and sends corresponding messages to a specified Slack channel.
 *
 * The bot requires a Slack Bot Token to be configured in the Medplum Bot secrets.
 */

import { BotEvent, MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

/**
 * Sends a message to a specified Slack channel.
 *
 * @param text - The message text to send to Slack.
 * @param slackBotToken - The Slack Bot Token for authentication.
 * @param slackChannel - The name or ID of the Slack channel to send the message to.
 * @throws Will throw an error if the Slack API request fails.
 */
const sendSlackMessage = async (text: string, slackBotToken: string, slackChannel: string): Promise<void> => {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${slackBotToken}`,
    },
    body: JSON.stringify({ channel: slackChannel, text }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send Slack message: ${response.statusText}`);
  }
};

/**
 * Medplum Bot handler function. This function is triggered by Medplum events
 * and sends a notification to Slack for each event.
 *
 * @param medplum - The Medplum client instance.
 * @param event - The bot event object containing input data and bot configuration.
 * @returns A promise that resolves to an object with a status code and message.
 */
export const handler = async (medplum: MedplumClient, event: BotEvent<Resource>): Promise<any> => {
  // Retrieve the Slack Bot Token from the bot's secrets
  const slackBotToken = event.secrets['SLACK_BOT_TOKEN'].valueString;

  // Specify the Slack channel to send messages to
  const slackChannel = 'general';

  // Check if the Slack Bot Token is available
  if (!slackBotToken) {
    throw new Error('Slack configuration is missing');
  }

  // Extract the resource from the event input
  const resource = event.input;

  // Construct the message to send to Slack
  const slackMessage = `Hello ${resource.resourceType}`;

  try {
    // Send the message to Slack
    await sendSlackMessage(slackMessage, slackBotToken, slackChannel);
    return { statusCode: 200, body: JSON.stringify({ status: 'Message sent to Slack' }) };
  } catch (error) {
    console.error('Error sending message to Slack:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send message to Slack' }) };
  }
};
