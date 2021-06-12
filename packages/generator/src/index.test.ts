import { main } from './index';

test('Generator completes successfully', async (done) => {
  main();
  done();
});
