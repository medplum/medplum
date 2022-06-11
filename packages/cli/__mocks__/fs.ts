export function existsSync(): boolean {
  return true;
}

export function readFileSync(): string {
  return JSON.stringify({
    bots: [
      {
        name: 'hello-world',
        id: '123',
        source: 'src/hello-world.ts',
        dist: 'dist/hello-world.js',
      },
      {
        name: 'does-not-exist',
        id: 'does-not-exist',
        source: 'src/does-not-exist.ts',
        dist: 'dist/does-not-exist.js',
      },
    ],
  });
}
