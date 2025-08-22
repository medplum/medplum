#!/usr/bin/env node

/**
 * Complete Setup Script for Medplum CI/CD Bots
 *
 * This script performs the complete setup:
 * 1. Builds all bots
 * 2. Deploys bots to Medplum
 * 3. Creates subscriptions with correct bot endpoints
 *
 * Usage:
 *   npm run setup
 *
 * @author Medplum Team
 * @version 1.0.0
 */

import { MedplumClient } from '@medplum/core';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Load configuration
let config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));

/**
 * Saves the updated configuration back to the file
 */
function saveConfig(): void {
  writeFileSync('./medplum.config.json', JSON.stringify(config, null, 2));
}

interface SubscriptionConfig {
  botName: string;
  resourceType: string;
  criteria: string;
  description: string;
}

interface SubscriptionResult {
  botName: string;
  subscriptionId?: string;
  status: 'success' | 'failed';
  error?: string;
}

interface BotDeploymentResult {
  botName: string;
  botId?: string;
  status: 'success' | 'failed';
  error?: string;
}

/**
 * Builds all bots using the existing build process
 */
async function buildBots(): Promise<void> {
  console.log('🔨 Building bots...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Bots built successfully\n');
  } catch (error) {
    console.error('❌ Failed to build bots:', error);
    throw error;
  }
}

/**
 * Deploys all bots to Medplum using the API
 */
async function deployBots(medplum: MedplumClient): Promise<BotDeploymentResult[]> {
  console.log('🚀 Deploying bots to Medplum...\n');

  const results: BotDeploymentResult[] = [];

  for (const bot of config.bots) {
    try {
      console.log(`📦 Deploying ${bot.name}...`);

      // Read the bot source file
      const botSource = readFileSync(bot.source, 'utf8');

      let botResource;

      if (bot.id) {
        // Update existing bot
        console.log(`   Updating existing bot with ID: ${bot.id}`);
        botResource = await medplum.updateResource({
          resourceType: 'Bot',
          id: bot.id,
          name: bot.name,
          description: `CI/CD Bot: ${bot.name}`,
          code: botSource,
          runtimeVersion: 'awslambda',
          meta: {
            tag: [
              {
                system: 'https://medplum.com/tags',
                code: 'ci-cd-bot',
                display: 'CI/CD Bot',
              },
            ],
          },
        });
      } else {
        // Create new bot
        console.log(`   Creating new bot`);
        botResource = await medplum.createResource({
          resourceType: 'Bot',
          name: bot.name,
          description: `CI/CD Bot: ${bot.name}`,
          code: botSource,
          runtimeVersion: 'awslambda',
          meta: {
            tag: [
              {
                system: 'https://medplum.com/tags',
                code: 'ci-cd-bot',
                display: 'CI/CD Bot',
              },
            ],
          },
        });

        // Update the config with the new bot ID
        bot.id = botResource.id || '';

        // Save the updated config to persist the bot ID
        saveConfig();
      }

      results.push({
        botName: bot.name,
        botId: botResource.id || '',
        status: 'success',
      });

      console.log(`   ✅ Deployed with ID: ${botResource.id}\n`);
    } catch (error) {
      results.push({
        botName: bot.name,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  return results;
}

/**
 * Creates a subscription for a bot
 *
 * @param medplum - The Medplum client
 * @param botName - The name of the bot
 * @param botId - The deployed bot ID
 * @param resourceType - The resource type to subscribe to
 * @param criteria - The subscription criteria
 */
async function createSubscription(
  medplum: MedplumClient,
  botName: string,
  botId: string,
  resourceType: string,
  criteria: string
): Promise<any> {
  try {
    const subscription = await medplum.createResource({
      resourceType: 'Subscription',
      status: 'active',
      reason: `CI/CD Bot: ${botName}`,
      criteria: `${resourceType}?${criteria}`,
      channel: {
        type: 'rest-hook',
        endpoint: `Bot/${botId}`,
        payload: 'application/fhir+json',
      },
      meta: {
        tag: [
          {
            system: 'https://medplum.com/tags',
            code: 'ci-cd-bot',
            display: 'CI/CD Bot',
          },
        ],
      },
    });

    console.log(`✅ Created subscription for ${botName}`);
    return subscription;
  } catch (error) {
    console.error(`❌ Failed to create subscription for ${botName}:`, error);
    throw error;
  }
}

/**
 * Creates all subscriptions for the deployed bots
 *
 * @param medplum - The Medplum client
 * @param deployedBots - Results from bot deployment
 */
async function createAllSubscriptions(
  medplum: MedplumClient,
  deployedBots: BotDeploymentResult[]
): Promise<SubscriptionResult[]> {
  console.log('🔗 Creating subscriptions for deployed bots...\n');

  const subscriptions: SubscriptionConfig[] = [
    {
      botName: 'hapi-sync-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Syncs patient data to HAPI server and returns enriched resource',
    },
    {
      botName: 'hapi-sync-simple-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Syncs patient data to HAPI server (simple version)',
    },
  ];

  const results: SubscriptionResult[] = [];

  for (const subscription of subscriptions) {
    // Find the corresponding deployed bot
    const deployedBot = deployedBots.find((bot) => bot.botName === subscription.botName);

    if (!deployedBot || deployedBot.status === 'failed') {
      results.push({
        botName: subscription.botName,
        status: 'failed',
        error: deployedBot?.error || 'Bot deployment failed',
      });

      console.log(`📋 Skipping subscription for ${subscription.botName} (bot deployment failed)\n`);
      continue;
    }

    try {
      console.log(`📋 Creating subscription for ${subscription.botName}...`);
      console.log(`   Description: ${subscription.description}`);
      console.log(`   Bot ID: ${deployedBot.botId}`);

      const result = await createSubscription(
        medplum,
        subscription.botName,
        deployedBot.botId!,
        subscription.resourceType,
        subscription.criteria
      );

      results.push({
        botName: subscription.botName,
        subscriptionId: result.id,
        status: 'success',
      });

      console.log(`   ✅ Subscription ID: ${result.id}\n`);
    } catch (error) {
      results.push({
        botName: subscription.botName,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  return results;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const deployOnly = process.argv.includes('--deploy-only');

  try {
    if (deployOnly) {
      console.log('🔧 Medplum CI/CD Bots - Deployment Only\n');
      console.log('This script will:');
      console.log('1. Build bots with latest code changes');
      console.log('2. Deploy bots to Medplum\n');
    } else {
      console.log('🔧 Medplum CI/CD Bots - Complete Setup\n');
      console.log('This script will:');
      console.log('1. Build 2 bots that demonstrate code sharing');
      console.log('2. Deploy bots to Medplum');
      console.log('3. Create subscriptions with correct bot endpoints\n');
    }

    // Step 1: Build bots
    await buildBots();

    // Step 2: Initialize Medplum client
    const medplum = new MedplumClient({
      baseUrl: process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com',
      clientId: process.env['MEDPLUM_CLIENT_ID'] || '',
      clientSecret: process.env['MEDPLUM_CLIENT_SECRET'] || '',
    });

    // Step 3: Deploy bots
    const deployedBots = await deployBots(medplum);

    // Step 4: Create subscriptions (only if not deploy-only)
    let subscriptionResults: SubscriptionResult[] = [];
    if (!deployOnly) {
      subscriptionResults = await createAllSubscriptions(medplum, deployedBots);
    }

    // Print summary
    if (deployOnly) {
      console.log('📊 Deployment Summary:');
      console.log('==================\n');

      // Bot deployment summary
      console.log('🤖 Bot Deployment:');
      const successfulBots = deployedBots.filter((r) => r.status === 'success');
      const failedBots = deployedBots.filter((r) => r.status === 'failed');

      console.log(`✅ Successful: ${successfulBots.length}`);
      successfulBots.forEach((result) => {
        console.log(`   - ${result.botName}: ${result.botId}`);
      });

      if (failedBots.length > 0) {
        console.log(`❌ Failed: ${failedBots.length}`);
        failedBots.forEach((result) => {
          console.log(`   - ${result.botName}: ${result.error}`);
        });
      }

      console.log('\n🎉 Deployment complete!');
      console.log('\nNext steps:');
      console.log('1. Test the updated bots by creating/updating resources');
      console.log('2. Monitor bot execution in the Medplum console');
    } else {
      console.log('📊 Setup Summary:');
      console.log('==================');

      // Bot deployment summary
      console.log('\n🤖 Bot Deployment:');
      const successfulBots = deployedBots.filter((r) => r.status === 'success');
      const failedBots = deployedBots.filter((r) => r.status === 'failed');

      console.log(`✅ Successful: ${successfulBots.length}`);
      successfulBots.forEach((result) => {
        console.log(`   - ${result.botName}: ${result.botId}`);
      });

      if (failedBots.length > 0) {
        console.log(`❌ Failed: ${failedBots.length}`);
        failedBots.forEach((result) => {
          console.log(`   - ${result.botName}: ${result.error}`);
        });
      }

      // Subscription summary
      console.log('\n🔗 Subscriptions:');
      const successfulSubs = subscriptionResults.filter((r) => r.status === 'success');
      const failedSubs = subscriptionResults.filter((r) => r.status === 'failed');

      console.log(`✅ Successful: ${successfulSubs.length}`);
      successfulSubs.forEach((result) => {
        console.log(`   - ${result.botName}: ${result.subscriptionId}`);
      });

      if (failedSubs.length > 0) {
        console.log(`❌ Failed: ${failedSubs.length}`);
        failedSubs.forEach((result) => {
          console.log(`   - ${result.botName}: ${result.error}`);
        });
      }

      console.log('\n🎉 Setup complete!');
      console.log('\nNext steps:');
      console.log('1. Test the bots by creating/updating Patient resources');
      console.log('2. Monitor bot execution in the Medplum console');
      console.log('3. Check subscription status in the Medplum console');
    }
  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);
