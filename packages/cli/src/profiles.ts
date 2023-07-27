import { Command } from 'commander';
import { createMedplumCommand } from './util/command';
import { FileSystemStorage } from './storage';
import { resolve } from 'path';
import { readdirSync } from 'fs';
import { homedir } from 'os';
import { createProfile, getProfileOptions } from './utils';

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
    createProfile(profileName, options);
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
    const profile = getProfileOptions(profileName);
    console.log(profile);
  });
