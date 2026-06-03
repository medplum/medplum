// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export class MockConsole {
  readonly messages: string[] = [];

  log(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  toString(): string {
    return this.messages.join('\n');
  }
}
