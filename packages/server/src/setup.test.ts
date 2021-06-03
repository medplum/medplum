import { main } from './setup';

test('Setup completes', async (done) => {
  await main();
  done();
});
