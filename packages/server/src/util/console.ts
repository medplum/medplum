// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export class MockConsole {
  readonly messages: string[] = [];
  private readonly counts = new Map<string, number>();

  log(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  info(...params: any[]): void {
    this.log(...params);
  }

  warn(...params: any[]): void {
    this.log(...params);
  }

  error(...params: any[]): void {
    this.log(...params);
  }

  debug(...params: any[]): void {
    this.log(...params);
  }

  trace(...params: any[]): void {
    this.log(...params);
  }

  dir(...params: any[]): void {
    this.log(...params);
  }

  table(...params: any[]): void {
    this.log(...params);
  }

  dirxml(...params: any[]): void {
    this.log(...params);
  }

  assert(condition: unknown, ...params: any[]): void {
    if (!condition) {
      this.log('Assertion failed:', ...params);
    }
  }

  clear(): void {
    // No-op; included for compatibility with code that expects a full console.
  }

  count(label = 'default'): void {
    const count = (this.counts.get(label) ?? 0) + 1;
    this.counts.set(label, count);
    this.log(`${label}: ${count}`);
  }

  countReset(label = 'default'): void {
    this.counts.delete(label);
  }

  group(...params: any[]): void {
    this.log(...params);
  }

  groupCollapsed(...params: any[]): void {
    this.log(...params);
  }

  groupEnd(): void {
    // No-op; indentation is not tracked in captured bot logs.
  }

  toString(): string {
    return this.messages.join('\n');
  }
}
