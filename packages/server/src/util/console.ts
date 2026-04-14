// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export class MockConsole {
  readonly messages: string[] = [];

  log(...params: any[]): undefined {
    this.messages.push(params.join(' '));
  }

  error(...params: any[]): undefined {
    this.messages.push(params.join(' '));
  }

  warn(...params: any[]): undefined {
    this.messages.push(params.join(' '));
  }

  info(...params: any[]): undefined {
    this.messages.push(params.join(' '));
  }

  debug(...params: any[]): undefined {
    this.messages.push(params.join(' '));
  }

  trace(...params: any[]): undefined {
    this.messages.push(params.join(' '));
  }

  dir(item?: any): undefined {
    if (item !== undefined) {
      this.messages.push(typeof item === 'string' ? item : JSON.stringify(item, undefined, 2));
    }
  }

  assert(condition?: boolean, ...params: any[]): undefined {
    if (!condition) {
      this.messages.push('Assertion failed: ' + params.join(' '));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  time(label?: string): undefined {
    // No-op: timer start not tracked in mock
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  timeEnd(label?: string): undefined {
    // No-op: timer end not tracked in mock
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  timeLog(label?: string, ...params: any[]): undefined {
    // No-op: timer log not tracked in mock
  }

  group(...params: any[]): undefined {
    if (params.length > 0) {
      this.messages.push(params.join(' '));
    }
  }

  groupEnd(): undefined {
    // No-op
  }

  table(tabularData?: any): undefined {
    if (tabularData !== undefined) {
      this.messages.push(typeof tabularData === 'string' ? tabularData : JSON.stringify(tabularData, undefined, 2));
    }
  }

  clear(): undefined {
    // No-op: does not clear messages array to preserve test assertions
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  count(label?: string): undefined {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  countReset(label?: string): undefined {}

  toString(): string {
    return this.messages.join('\n');
  }
}
