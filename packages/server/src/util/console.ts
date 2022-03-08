export class MockConsole {
  readonly messages: string[] = [];

  log(...params: any[]): void {
    this.messages.push(params.join(' '));
  }

  toString(): string {
    return this.messages.join('\n');
  }
}
