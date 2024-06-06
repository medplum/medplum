import { agentMain } from './agent-main';
import { upgraderMain } from './upgrader';

export async function main(argv: string[]): Promise<void> {
  if (argv[2] === '--upgrade') {
    await upgraderMain(argv);
  } else {
    await agentMain(argv);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  main(process.argv).catch(console.error);
}
