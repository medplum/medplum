/* globals module require globalThis */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MemoryStorage } = require('@medplum/core');
require('web-streams-polyfill');

module.exports = () => {
  Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
};
