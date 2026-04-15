import {
  __toESM,
  require_react
} from "./chunk-IIBV4UV7.js";

// ../../node_modules/@mantine/store/esm/store.mjs
var import_react = __toESM(require_react(), 1);
function createStore(initialState) {
  let state = initialState;
  let initialized = false;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getState() {
      return state;
    },
    updateState(value) {
      state = typeof value === "function" ? value(state) : value;
    },
    setState(value) {
      this.updateState(value);
      listeners.forEach((listener) => listener(state));
    },
    initialize(value) {
      if (!initialized) {
        state = value;
        initialized = true;
      }
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  };
}
function useStore(store) {
  return (0, import_react.useSyncExternalStore)(
    store.subscribe,
    () => store.getState(),
    () => store.getState()
  );
}

export {
  createStore,
  useStore
};
//# sourceMappingURL=chunk-ZNRVVZUU.js.map
