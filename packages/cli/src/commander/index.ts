import { Command } from 'commander';
import { FileSystemStorage } from '../storage';
import { MedplumClient } from '@medplum/core';
import dotenv from 'dotenv';
import { bot } from './bots';
import { createBotDeprecate, deployBotDeprecate, saveBotDeprecate } from './legacy-bot';
import { login, whoami } from './auth';
import { deleteObject, get, patch, post, put } from './rest';

dotenv.config();
export const baseUrl = process.env['MEDPLUM_BASE_URL'] || 'https://api.medplum.com/';
export const medplum = new MedplumClient({ fetch, baseUrl, storage: new FileSystemStorage() });

const index = new Command('medplum').description('Command to access Medplum CLI');

index.version('0.1.0');

// Auth commands
index.addCommand(login);
index.addCommand(whoami);

// REST commands
index.addCommand(get);
index.addCommand(post);
index.addCommand(patch);
index.addCommand(put);
index.addCommand(deleteObject);

// Bot Commands
index.addCommand(bot);

// Deprecated Bot Commands
index.addCommand(saveBotDeprecate);
index.addCommand(deployBotDeprecate);
index.addCommand(createBotDeprecate);

index.parse(process.argv);
