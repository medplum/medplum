// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export class MockConsole {
  readonly messages: string[] = [];

  log(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  // Bots (and their dependencies) expect the standard console methods. Route all
  // levels into the same buffer so a console.error/warn/info/debug call does not
  // throw "console.X is not a function" inside the vmcontext sandbox.
  error(...params: any[]): void {
    this.log(...params);
  }

  warn(...params: any[]): void {
    this.log(...params);
  }

  info(...params: any[]): void {
    this.log(...params);
  }

  debug(...params: any[]): void {
    this.log(...params);
  }

  toString(): string {
    return this.messages.join('\n');
  }
}
