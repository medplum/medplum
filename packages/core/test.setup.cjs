/* globals module require globalThis */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MemoryStorage } = require('./src/storage');

module.exports = () => {
  Object.defineProperty(globalThis.window, 'sessionStorage', { value: new MemoryStorage() });
};
