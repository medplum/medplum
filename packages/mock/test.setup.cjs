/* globals module require globalThis */
/* eslint-disable @typescript-eslint/no-require-imports */
const { TextDecoder, TextEncoder } = require('node:util');

module.exports = () => {
  Object.defineProperty(globalThis.window, 'TextDecoder', { value: TextDecoder });
  Object.defineProperty(globalThis.window, 'TextEncoder', { value: TextEncoder });
};
