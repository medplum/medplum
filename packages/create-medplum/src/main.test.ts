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
    vi.mocked(fs.readFileSync).mockReturnValue('MEDPLUM_BASE_URL=https://api.medplum.com/\n');
    vi.mocked(readline.createInterface).mockReturnValue(
      mockReadline(
        '1', // Choose project #1 - Provider (default)
        '', // Choose project name - use default
        '', // Choose server URL - use default
        'n' // Do not create a GitHub repository
      )
    );
    await main();
    // The chosen server URL is written to .env, not src/config.ts
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('MEDPLUM_BASE_URL=https://api.medplum.com/')
    );
    // Cloning uses HTTPS so no SSH key is required
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('clone https://github.com/medplum/medplum-provider.git'),
      expect.anything()
    );
    expect(console.log).toHaveBeenCalledWith('Successfully created project medplum-provider!');
  });

  test('Validation errors', async () => {
    console.log = vi.fn();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('MEDPLUM_BASE_URL=https://api.medplum.com/\n');
    vi.mocked(readline.createInterface).mockReturnValue(
      mockReadline(
        '1000', // Invalid project #
        '1', // Choose project #1 - Provider (default)
        'not a valid project name', // Invalid project name
        'a-different-project-name', // Choose project name
        'not a valid server URL', // Invalid server URL
        '', // Choose server URL - use default
        'maybe', // Invalid yes/no answer
        'n' // Do not create a GitHub repository
      )
    );
    await main();
    expect(console.log).toHaveBeenCalledWith('Successfully created project a-different-project-name!');
  });

  test('Creates a GitHub repository when requested', async () => {
    console.log = vi.fn();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('MEDPLUM_BASE_URL=https://api.medplum.com/\n');
    vi.mocked(readline.createInterface).mockReturnValue(
      mockReadline(
        '1', // Choose project #1 - Provider (default)
        '', // Choose project name - use default
        '', // Choose server URL - use default
        'y', // Create a GitHub repository
        'public' // Repository visibility
      )
    );
    await main();
    expect(cp.execSync).toHaveBeenCalledWith(
      expect.stringContaining('repo create medplum-provider --public --source=. --remote=origin --push'),
      expect.anything()
    );
    expect(console.log).toHaveBeenCalledWith('Successfully created project medplum-provider!');
  });

  test('Prints manual instructions when the GitHub CLI is missing', async () => {
    console.log = vi.fn();
    // `gh` is not found in any directory; `git`/`npm` still resolve normally.
    vi.mocked(fs.existsSync).mockImplementation((p) => !/[\\/]gh(\.[a-z]+)?$/i.test(String(p)));
    vi.mocked(fs.readFileSync).mockReturnValue('MEDPLUM_BASE_URL=https://api.medplum.com/\n');
    vi.mocked(readline.createInterface).mockReturnValue(
      mockReadline(
        '1', // Choose project #1 - Provider (default)
        '', // Choose project name - use default
        '', // Choose server URL - use default
        'y', // Create a GitHub repository
        'private' // Repository visibility
      )
    );
    await main();
    // Falls back to printing the manual command rather than aborting
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('gh repo create medplum-provider --private --source=. --remote=origin --push')
    );
    expect(console.log).toHaveBeenCalledWith('Successfully created project medplum-provider!');
  });

  test('Resolves tools on Windows', async () => {
    console.log = vi.fn();
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('MEDPLUM_BASE_URL=https://api.medplum.com/\n');
      vi.mocked(readline.createInterface).mockReturnValue(
        mockReadline(
          '1', // Choose project #1 - Provider (default)
          '', // Choose project name - use default
          '', // Choose server URL - use default
          'n' // Do not create a GitHub repository
        )
      );
      await main();
      expect(console.log).toHaveBeenCalledWith('Successfully created project medplum-provider!');
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    }
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
        '1', // Choose project #1 - Provider (default)
        '', // Choose project name - use default
        '', // Choose server URL - use default
        'n' // Do not create a GitHub repository
      )
    );
    await expect(async () => main()).rejects.toThrow('git error');
    expect(console.log).not.toHaveBeenCalledWith('Successfully created project medplum-provider!');
    expect(console.error).toHaveBeenCalledWith('Error initializing project:', expect.any(Error));
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('medplum-provider'), {
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
