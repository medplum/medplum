import { run } from '@medplum/cli';
import { normalizeErrorString } from '@medplum/core';

if (require.main === module) {
  run().catch((err) => {
    console.error('Unhandled error:', normalizeErrorString(err));
    process.exit(1);
  });
}
