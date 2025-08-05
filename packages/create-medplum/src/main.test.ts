// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import cp from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { main } from './main';

jest.mock('node:child_process');
jest.mock('node:fs');
jest.mock('node:readline/promises');

describe('Medplum initializer', () => {
  test('Happy path', async () => {
    console.log = jest.fn();
    fs.existsSync = jest.fn(() => true);
    fs.readFileSync = jest.fn(() => "baseUrl: 'https://example.com',") as any;
    readline.createInterface = jest.fn(() =>
      mockReadline(
        '1', // Choose project #1 - Hello World
        '', // Choose project name - use default
        '' // Choose server URL - use default
      )
    );
    await main();
    expect(console.log).toHaveBeenCalledWith('Successfully created project medplum-hello-world!');
  });

  test('Validation errors', async () => {
    console.log = jest.fn();
    readline.createInterface = jest.fn(() =>
      mockReadline(
        '1000', // Invalid project #
        '1', // Choose project #1 - Hello World
        'not a valid project name', // Invalid project name
        'a-different-project-name', // Choose project name
        'not a valid server URL', // Invalid server URL
        '' // Choose server URL - use default
      )
    );
    await main();
    expect(console.log).toHaveBeenCalledWith('Successfully created project a-different-project-name!');
  });

  test('Cleanup on git error', async () => {
    console.log = jest.fn();
    console.error = jest.fn();
    cp.execSync = jest.fn(() => {
      throw new Error('git error');
    });
    fs.existsSync = jest.fn(() => true);
    readline.createInterface = jest.fn(() =>
      mockReadline(
        '1', // Choose project #1 - Hello World
        '', // Choose project name - use default
        '' // Choose server URL - use default
      )
    );
    await expect(async () => main()).rejects.toThrow('git error');
    expect(console.log).not.toHaveBeenCalledWith('Successfully created project medplum-hello-world!');
    expect(console.error).toHaveBeenCalledWith('Error initializing project:', expect.any(Error));
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('medplum-hello-world'), {
      force: true,
      recursive: true,
    });
  });
});

export function mockReadline(...answers: string[]): readline.Interface {
  const result = { write: jest.fn(), question: jest.fn(), close: jest.fn() };
  const debug = true;
  for (const answer of answers) {
    result.question.mockImplementationOnce(async (q: string) => {
      if (debug) {
        console.log(q, answer);
      }
      return answer;
    });
  }
  return result as unknown as readline.Interface;
}
