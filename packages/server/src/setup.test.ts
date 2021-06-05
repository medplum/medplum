import { closeDatabase, initDatabase } from './database';
import { setup } from './setup';

test('Setup completes', async (done) => {
  await initDatabase({ client: 'sqlite3' });
  await setup();
  await closeDatabase();
  done();
});
