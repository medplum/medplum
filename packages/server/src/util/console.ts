// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export class MockConsole {
  readonly messages: string[] = [];

  log(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  error(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  warn(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  info(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  debug(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  trace(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  dir(item?: any): void {
    if (item !== undefined) {
      this.messages.push(typeof item === 'string' ? item : JSON.stringify(item, undefined, 2));
    }
  }

  assert(condition?: boolean, ...params: any[]): void {
    if (!condition) {
      this.messages.push('Assertion failed: ' + params.join(' '));
    }
  }

  time(label?: string): void {
    // No-op: timer start not tracked in mock
    void label;
  }

  timeEnd(label?: string): void {
    // No-op: timer end not tracked in mock
    void label;
  }

  timeLog(label?: string, ...params: any[]): void {
    // No-op: timer log not tracked in mock
    void label;
    void params;
  }

  group(...params: any[]): void {
    if (params.length > 0) {
      this.messages.push(params.join(' '));
    }
  }

  groupEnd(): void {
    // No-op
  }

  table(tabularData?: any): void {
    if (tabularData !== undefined) {
      this.messages.push(typeof tabularData === 'string' ? tabularData : JSON.stringify(tabularData, undefined, 2));
    }
  }

  clear(): void {
    // No-op: does not clear messages array to preserve test assertions
  }

  count(label?: string): void {
    void label;
  }

  countReset(label?: string): void {
    void label;
  }

  toString(): string {
    return this.messages.join('\n');
  }
}
