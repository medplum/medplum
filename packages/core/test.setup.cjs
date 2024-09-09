/* globals module require globalThis */
/* eslint-disable @typescript-eslint/no-require-imports */
const { TextDecoder, TextEncoder } = require('node:util');
const { MemoryStorage } = require('./src/storage');

module.exports = () => {
  Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
  Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
  Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });
};
