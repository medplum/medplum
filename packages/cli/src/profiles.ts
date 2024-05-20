import { Command } from 'commander';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { FileSystemStorage } from './storage';
import { createMedplumCommand } from './util/command';
import { loadProfile, saveProfile } from './utils';

const setProfile = createMedplumCommand('set');
const removeProfile = createMedplumCommand('remove');
const listProfiles = createMedplumCommand('list');
const describeProfile = createMedplumCommand('describe');

export const profile = new Command('profile')
  .addCommand(setProfile)
  .addCommand(removeProfile)
  .addCommand(listProfiles)
  .addCommand(describeProfile);

setProfile
  .argument('<profileName>', 'Name of the profile')
  .description('Create a new profile or replace it with the given name and its associated properties')
  .action(async (profileName, options) => {
    saveProfile(profileName, options);
  });

removeProfile
  .argument('<profileName>', 'Name of the profile')
  .description('Remove a profile by name')
  .action(async (profileName) => {
    const storage = new FileSystemStorage(profileName);
    storage.setObject('options', undefined);
    console.log(`${profileName} profile removed`);
  });

listProfiles.description('List all profiles saved').action(async () => {
  const dir = resolve(homedir(), '.medplum');
  const files = readdirSync(dir);
  const allProfiles: any[] = [];
  files.forEach((file) => {
    const fileName = file.split('.')[0];
    const storage = new FileSystemStorage(fileName);
    const profile = storage.getObject('options');
    if (profile) {
      allProfiles.push({ profileName: fileName, profile });
    }
  });
  console.log(allProfiles);
});

describeProfile
  .argument('<profileName>', 'Name of the profile')
  .description('Describes a profile')
  .action(async (profileName) => {
    const profile = loadProfile(profileName);
    console.log(profile);
  });
