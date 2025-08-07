// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import JSZip from 'jszip';
import { getLogger } from '../../logger';
import { deployFissionFunction } from './utils';
import { FISSION_INDEX_CODE, FISSION_PACKAGE_JSON } from './wrapper';

export async function deployFissionBot(bot: WithId<Bot>, code: string): Promise<void> {
  const log = getLogger();
  log.info('Deploying Fission function for bot', { botId: bot.id });
  const zipFile = await createZipFile(code);
  log.debug('Fission function zip size', { bytes: zipFile.byteLength });
  await deployFissionFunction(bot.id, zipFile);
  log.info('Fission function deployed successfully', { botId: bot.id });
}

async function createZipFile(code: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('user.js', code);
  zip.file('index.js', FISSION_INDEX_CODE);
  zip.file('package.json', FISSION_PACKAGE_JSON);
  return zip.generateAsync({ type: 'uint8array' });
}
