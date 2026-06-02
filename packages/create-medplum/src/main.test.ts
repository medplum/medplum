// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import cp from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { vi } from 'vitest';
import { main } from './main';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:readline/promises');

describe('Medplum initializer', () => {
  test('Happy path', async () => {
    console.log = vi.fn();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("baseUrl: 'https://example.com',");
    vi.mocked(readline.createInterface).mockReturnValue(
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
    console.log = vi.fn();
    vi.mocked(readline.createInterface).mockReturnValue(
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
    console.log = vi.fn();
    console.error = vi.fn();
    vi.mocked(cp.execSync).mockImplementation(() => {
      throw new Error('git error');
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(readline.createInterface).mockReturnValue(
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
  const result = { write: vi.fn(), question: vi.fn(), close: vi.fn() };
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
