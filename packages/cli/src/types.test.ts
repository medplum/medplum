// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDataDir } from '@medplum/definitions';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Mock } from 'vitest';
import { main } from '.';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');

const US_CORE_PROFILES = resolve(getDataDir(), 'fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');

describe('CLI generate-types', () => {
  let outputDir: string;
  let medplum: MockClient;

  beforeAll(() => {
    process.exit = vi.fn<(exitCode?: number) => never>().mockImplementation(function exit(exitCode?: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    });
  });

  beforeEach(() => {
    console.log = vi.fn();
    vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
    outputDir = mkdtempSync(join(tmpdir(), 'medplum-generate-types-'));
    medplum = new MockClient();
    (createMedplumClient as unknown as Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  test('Generates types for profiles in files and on the server', async () => {
    const [patient, race] = JSON.parse(readFileSync(US_CORE_PROFILES, 'utf8')) as StructureDefinition[];
    const filePath = join(outputDir, 'patient.json');
    writeFileSync(filePath, JSON.stringify(patient));
    // MockClient does not support searching StructureDefinitions by url
    const searchOne = vi.spyOn(medplum, 'searchOne').mockResolvedValue(race as any);

    await main(['node', 'index.js', 'generate-types', filePath, '--profile-url', race.url, '--output-dir', outputDir]);

    expect(readdirSync(outputDir).sort()).toStrictEqual([
      'USCorePatientProfile.d.ts',
      'USCoreRaceExtension.d.ts',
      'index.d.ts',
      'patient.json',
    ]);
    expect(searchOne).toHaveBeenCalledWith('StructureDefinition', { url: race.url, _sort: '-_lastUpdated' });
    expect(console.log).toHaveBeenCalledWith(`Generated 2 type definitions in ${outputDir}`);
  });

  test('Profile not found on the server', async () => {
    await expect(
      main(['node', 'index.js', 'generate-types', '--profile-url', 'http://example.com/missing', '-o', outputDir])
    ).rejects.toThrow('Process exited with exit code 1');
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('StructureDefinition not found: http://example.com/missing')
    );
  });

  test('Requires at least one input', async () => {
    await expect(main(['node', 'index.js', 'generate-types', '-o', outputDir])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('At least one file or --profile-url is required')
    );
  });
});
