import { Command } from 'commander';
import { createMedplumCommand } from './util/command';

const setProfile = createMedplumCommand('set');
const removeProfile = createMedplumCommand('remove');
const listProfiles = createMedplumCommand('list');
const describeProfile = createMedplumCommand('describe');

export const profile = new Command('profile')
  .addCommand(setProfile)
  .addCommand(removeProfile)
  .addCommand(listProfiles)
  .addCommand(describeProfile);

setProfile.argument('<profileName>', 'Name of the profile').action(async (profileName, options) => {
  //   const medplum = await createMedplumClient(options);
});

removeProfile.argument('<profileName>', 'Name of the profile').action(async (profileName, options) => {
  //   await createMedplumClient(options);
});

listProfiles.action(async (options) => {
  // reading all the data from the json files
});

describeProfile.argument('<profileName>', 'Name of the profile').action(async (profileName, options) => {
  // reading data from one json file based on the profilename
});
