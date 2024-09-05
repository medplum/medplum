import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

// expect.extend(matchers);

afterEach(() => {
  cleanup();
});
