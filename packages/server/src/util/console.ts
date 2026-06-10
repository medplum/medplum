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

  toString(): string {
    return this.messages.join('\n');
  }
}
