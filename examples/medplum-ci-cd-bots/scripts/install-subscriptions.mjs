#!/usr/bin/env node

/**
 * Install Script for Medplum CI/CD Bots
 * 
 * This script creates subscriptions for all the bots in the CI/CD example.
 * It demonstrates how to programmatically set up the infrastructure
 * needed for the bots to function properly.
 * 
 * Usage:
 *   npm run install:subscriptions
 * 
 * @author Medplum Team
 * @version 1.0.0
 */

import { MedplumClient } from '@medplum/core';
import { readFileSync } from 'fs';

// Load configuration
const config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));

/**
 * Creates a subscription for a bot
 * 
 * @param medplum - The Medplum client
 * @param botName - The name of the bot
 * @param resourceType - The resource type to subscribe to
 * @param criteria - The subscription criteria
 */
async function createSubscription(medplum, botName, resourceType, criteria) {
  try {
    const subscription = await medplum.createResource({
      resourceType: 'Subscription',
      status: 'active',
      reason: `CI/CD Bot: ${botName}`,
      criteria: `${resourceType}?${criteria}`,
      channel: {
        type: 'rest-hook',
        endpoint: `https://api.medplum.com/bots/${botName}`,
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
 * Creates all subscriptions for the CI/CD bots
 * 
 * @param medplum - The Medplum client
 */
async function createAllSubscriptions(medplum: MedplumClient) {
  console.log('🚀 Creating subscriptions for CI/CD bots...\n');

  const subscriptions = [
    {
      botName: 'patient-validation-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Validates patient data on create/update',
    },
    {
      botName: 'patient-audit-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Creates audit events for patient changes',
    },
    {
      botName: 'patient-notification-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Sends notifications for patient changes',
    },
    {
      botName: 'resource-sync-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Syncs patient data to external systems',
    },
    {
      botName: 'data-quality-bot',
      resourceType: 'Patient',
      criteria: '_lastUpdated=gt2023-01-01',
      description: 'Performs data quality analysis',
    },
  ];

  const results = [];

  for (const subscription of subscriptions) {
    try {
      console.log(`📋 Creating subscription for ${subscription.botName}...`);
      console.log(`   Description: ${subscription.description}`);
      
      const result = await createSubscription(
        medplum,
        subscription.botName,
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
async function main() {
  try {
    // Initialize Medplum client
    const medplum = new MedplumClient({
      baseUrl: process.env.MEDPLUM_BASE_URL || 'https://api.medplum.com',
      clientId: process.env.MEDPLUM_CLIENT_ID,
      clientSecret: process.env.MEDPLUM_CLIENT_SECRET,
    });

    console.log('🔧 Medplum CI/CD Bots - Subscription Installer\n');
    console.log('This script will create subscriptions for the following bots:');
    config.bots.forEach(bot => {
      console.log(`   - ${bot.name}`);
    });
    console.log('');

    // Create all subscriptions
    const results = await createAllSubscriptions(medplum);

    // Print summary
    console.log('📊 Installation Summary:');
    console.log('========================');
    
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');
    
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    
    if (successful.length > 0) {
      console.log('\nSuccessful installations:');
      successful.forEach(result => {
        console.log(`   - ${result.botName}: ${result.subscriptionId}`);
      });
    }
    
    if (failed.length > 0) {
      console.log('\nFailed installations:');
      failed.forEach(result => {
        console.log(`   - ${result.botName}: ${result.error}`);
      });
    }

    console.log('\n🎉 Installation complete!');
    console.log('\nNext steps:');
    console.log('1. Deploy your bots using: npm run deploy');
    console.log('2. Test the subscriptions by creating/updating Patient resources');
    console.log('3. Monitor bot execution in the Medplum dashboard');
    
  } catch (error) {
    console.error('💥 Installation failed:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error); 