import {
  __toESM,
  require_react
} from "./chunk-IIBV4UV7.js";

// ../../node_modules/@mantine/hooks/esm/utils/clamp/clamp.mjs
function clamp(value, min, max) {
  if (min === void 0 && max === void 0) {
    return value;
  }
  if (min !== void 0 && max === void 0) {
    return Math.max(value, min);
  }
  if (min === void 0 && max !== void 0) {
    return Math.min(value, max);
  }
  return Math.min(Math.max(value, min), max);
}

// ../../node_modules/@mantine/hooks/esm/utils/lower-first/lower-first.mjs
function lowerFirst(value) {
  return typeof value !== "string" ? "" : value.charAt(0).toLowerCase() + value.slice(1);
}

// ../../node_modules/@mantine/hooks/esm/utils/random-id/random-id.mjs
function randomId(prefix = "mantine-") {
  return `${prefix}${Math.random().toString(36).slice(2, 11)}`;
}

// ../../node_modules/@mantine/hooks/esm/utils/range/range.mjs
function range(start, end) {
  const length = Math.abs(end - start) + 1;
  const reversed = start > end;
  if (!reversed) {
    return Array.from({ length }, (_, index) => index + start);
  }
  return Array.from({ length }, (_, index) => start - index);
}

// ../../node_modules/@mantine/hooks/esm/utils/shallow-equal/shallow-equal.mjs
function shallowEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  if (!(a instanceof Object) || !(b instanceof Object)) {
    return false;
  }
  const keys = Object.keys(a);
  const { length } = keys;
  if (length !== Object.keys(b).length) {
    return false;
  }
  for (let i = 0; i < length; i += 1) {
    const key = keys[i];
    if (!(key in b)) {
      return false;
    }
    if (a[key] !== b[key] && !(Number.isNaN(a[key]) && Number.isNaN(b[key]))) {
      return false;
    }
  }
  return true;
}

// ../../node_modules/@mantine/hooks/esm/utils/upper-first/upper-first.mjs
function upperFirst(value) {
  return typeof value !== "string" ? "" : value.charAt(0).toUpperCase() + value.slice(1);
}

// ../../node_modules/@mantine/hooks/esm/utils/use-callback-ref/use-callback-ref.mjs
var import_react = __toESM(require_react(), 1);
function useCallbackRef(callback) {
  const callbackRef = (0, import_react.useRef)(callback);
  (0, import_react.useEffect)(() => {
    callbackRef.current = callback;
  });
  return (0, import_react.useMemo)(() => ((...args) => callbackRef.current?.(...args)), []);
}

// ../../node_modules/@mantine/hooks/esm/use-debounced-callback/use-debounced-callback.mjs
var import_react2 = __toESM(require_react(), 1);
function useDebouncedCallback(callback, options) {
  const { delay, flushOnUnmount, leading } = typeof options === "number" ? { delay: options, flushOnUnmount: false, leading: false } : options;
  const handleCallback = useCallbackRef(callback);
  const debounceTimerRef = (0, import_react2.useRef)(0);
  const lastCallback = (0, import_react2.useMemo)(() => {
    const currentCallback = Object.assign(
      (...args) => {
        window.clearTimeout(debounceTimerRef.current);
        const isFirstCall = currentCallback._isFirstCall;
        currentCallback._isFirstCall = false;
        function clearTimeoutAndLeadingRef() {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = 0;
          currentCallback._isFirstCall = true;
        }
        if (leading && isFirstCall) {
          handleCallback(...args);
          const resetLeadingState = () => {
            clearTimeoutAndLeadingRef();
          };
          const flush2 = () => {
            if (debounceTimerRef.current !== 0) {
              clearTimeoutAndLeadingRef();
              handleCallback(...args);
            }
          };
          const cancel2 = () => {
            clearTimeoutAndLeadingRef();
          };
          currentCallback.flush = flush2;
          currentCallback.cancel = cancel2;
          debounceTimerRef.current = window.setTimeout(resetLeadingState, delay);
          return;
        }
        if (leading && !isFirstCall) {
          const flush2 = () => {
            if (debounceTimerRef.current !== 0) {
              clearTimeoutAndLeadingRef();
              handleCallback(...args);
            }
          };
          const cancel2 = () => {
            clearTimeoutAndLeadingRef();
          };
          currentCallback.flush = flush2;
          currentCallback.cancel = cancel2;
          const resetLeadingState = () => {
            clearTimeoutAndLeadingRef();
          };
          debounceTimerRef.current = window.setTimeout(resetLeadingState, delay);
          return;
        }
        const flush = () => {
          if (debounceTimerRef.current !== 0) {
            clearTimeoutAndLeadingRef();
            handleCallback(...args);
          }
        };
        const cancel = () => {
          clearTimeoutAndLeadingRef();
        };
        currentCallback.flush = flush;
        currentCallback.cancel = cancel;
        debounceTimerRef.current = window.setTimeout(flush, delay);
      },
      {
        flush: () => {
        },
        cancel: () => {
        },
        _isFirstCall: true
      }
    );
    return currentCallback;
  }, [handleCallback, delay, leading]);
  (0, import_react2.useEffect)(
    () => () => {
      if (flushOnUnmount) {
        lastCallback.flush();
      } else {
        lastCallback.cancel();
      }
    },
    [lastCallback, flushOnUnmount]
  );
  return lastCallback;
}

// ../../node_modules/@mantine/hooks/esm/use-click-outside/use-click-outside.mjs
var import_react3 = __toESM(require_react(), 1);
var DEFAULT_EVENTS = ["mousedown", "touchstart"];
function useClickOutside(callback, events, nodes) {
  const ref = (0, import_react3.useRef)(null);
  const eventsList = events || DEFAULT_EVENTS;
  (0, import_react3.useEffect)(() => {
    const listener = (event) => {
      const { target } = event ?? {};
      if (Array.isArray(nodes)) {
        const shouldIgnore = !document.body.contains(target) && target?.tagName !== "HTML";
        const shouldTrigger = nodes.every((node) => !!node && !event.composedPath().includes(node));
        shouldTrigger && !shouldIgnore && callback(event);
      } else if (ref.current && !ref.current.contains(target)) {
        callback(event);
      }
    };
    eventsList.forEach((fn) => document.addEventListener(fn, listener));
    return () => {
      eventsList.forEach((fn) => document.removeEventListener(fn, listener));
    };
  }, [ref, callback, nodes]);
  return ref;
}

// ../../node_modules/@mantine/hooks/esm/use-clipboard/use-clipboard.mjs
var import_react4 = __toESM(require_react(), 1);
function useClipboard(options = { timeout: 2e3 }) {
  const [error, setError] = (0, import_react4.useState)(null);
  const [copied, setCopied] = (0, import_react4.useState)(false);
  const [copyTimeout, setCopyTimeout] = (0, import_react4.useState)(null);
  const handleCopyResult = (value) => {
    window.clearTimeout(copyTimeout);
    setCopyTimeout(window.setTimeout(() => setCopied(false), options.timeout));
    setCopied(value);
  };
  const copy = (value) => {
    if ("clipboard" in navigator) {
      navigator.clipboard.writeText(value).then(() => handleCopyResult(true)).catch((err) => setError(err));
    } else {
      setError(new Error("useClipboard: navigator.clipboard is not supported"));
    }
  };
  const reset = () => {
    setCopied(false);
    setError(null);
    window.clearTimeout(copyTimeout);
  };
  return { copy, reset, error, copied };
}

// ../../node_modules/@mantine/hooks/esm/use-media-query/use-media-query.mjs
var import_react5 = __toESM(require_react(), 1);
function attachMediaListener(query, callback) {
  try {
    query.addEventListener("change", callback);
    return () => query.removeEventListener("change", callback);
  } catch (e) {
    query.addListener(callback);
    return () => query.removeListener(callback);
  }
}
function getInitialValue(query, initialValue) {
  if (typeof window !== "undefined" && "matchMedia" in window) {
    return window.matchMedia(query).matches;
  }
  return false;
}
function useMediaQuery(query, initialValue, { getInitialValueInEffect } = {
  getInitialValueInEffect: true
}) {
  const [matches, setMatches] = (0, import_react5.useState)(
    getInitialValueInEffect ? initialValue : getInitialValue(query)
  );
  (0, import_react5.useEffect)(() => {
    try {
      const mediaQuery = window.matchMedia(query);
      setMatches(mediaQuery.matches);
      return attachMediaListener(mediaQuery, (event) => setMatches(event.matches));
    } catch (e) {
      return void 0;
    }
  }, [query]);
  return matches || false;
}

// ../../node_modules/@mantine/hooks/esm/use-color-scheme/use-color-scheme.mjs
function useColorScheme(initialValue, options) {
  return useMediaQuery("(prefers-color-scheme: dark)", initialValue === "dark", options) ? "dark" : "light";
}

// ../../node_modules/@mantine/hooks/esm/use-counter/use-counter.mjs
var import_react6 = __toESM(require_react(), 1);
var DEFAULT_OPTIONS = {
  min: -Infinity,
  max: Infinity
};
function useCounter(initialValue = 0, options) {
  const { min, max } = { ...DEFAULT_OPTIONS, ...options };
  const [count, setCount] = (0, import_react6.useState)(clamp(initialValue, min, max));
  const increment = (0, import_react6.useCallback)(
    () => setCount((current) => clamp(current + 1, min, max)),
    [min, max]
  );
  const decrement = (0, import_react6.useCallback)(
    () => setCount((current) => clamp(current - 1, min, max)),
    [min, max]
  );
  const set = (0, import_react6.useCallback)((value) => setCount(clamp(value, min, max)), [min, max]);
  const reset = (0, import_react6.useCallback)(
    () => setCount(clamp(initialValue, min, max)),
    [initialValue, min, max]
  );
  return [count, { increment, decrement, set, reset }];
}

// ../../node_modules/@mantine/hooks/esm/use-debounced-state/use-debounced-state.mjs
var import_react7 = __toESM(require_react(), 1);
function useDebouncedState(defaultValue, wait, options = { leading: false }) {
  const [value, setValue] = (0, import_react7.useState)(defaultValue);
  const timeoutRef = (0, import_react7.useRef)(null);
  const leadingRef = (0, import_react7.useRef)(true);
  const clearTimeout2 = () => window.clearTimeout(timeoutRef.current);
  (0, import_react7.useEffect)(() => clearTimeout2, []);
  const debouncedSetValue = (0, import_react7.useCallback)(
    (newValue) => {
      clearTimeout2();
      if (leadingRef.current && options.leading) {
        setValue(newValue);
      } else {
        timeoutRef.current = window.setTimeout(() => {
          leadingRef.current = true;
          setValue(newValue);
        }, wait);
      }
      leadingRef.current = false;
    },
    [options.leading]
  );
  return [value, debouncedSetValue];
}

// ../../node_modules/@mantine/hooks/esm/use-debounced-value/use-debounced-value.mjs
var import_react8 = __toESM(require_react(), 1);
function useDebouncedValue(value, wait, options = { leading: false }) {
  const [_value, setValue] = (0, import_react8.useState)(value);
  const mountedRef = (0, import_react8.useRef)(false);
  const timeoutRef = (0, import_react8.useRef)(null);
  const cooldownRef = (0, import_react8.useRef)(false);
  const cancel = (0, import_react8.useCallback)(() => window.clearTimeout(timeoutRef.current), []);
  (0, import_react8.useEffect)(() => {
    if (mountedRef.current) {
      if (!cooldownRef.current && options.leading) {
        cooldownRef.current = true;
        setValue(value);
      } else {
        cancel();
        timeoutRef.current = window.setTimeout(() => {
          cooldownRef.current = false;
          setValue(value);
        }, wait);
      }
    }
  }, [value, options.leading, wait]);
  (0, import_react8.useEffect)(() => {
    mountedRef.current = true;
    return cancel;
  }, []);
  return [_value, cancel];
}

// ../../node_modules/@mantine/hooks/esm/use-isomorphic-effect/use-isomorphic-effect.mjs
var import_react9 = __toESM(require_react(), 1);
var useIsomorphicEffect = typeof document !== "undefined" ? import_react9.useLayoutEffect : import_react9.useEffect;

// ../../node_modules/@mantine/hooks/esm/use-document-title/use-document-title.mjs
function useDocumentTitle(title) {
  useIsomorphicEffect(() => {
    if (typeof title === "string" && title.trim().length > 0) {
      document.title = title.trim();
    }
  }, [title]);
}

// ../../node_modules/@mantine/hooks/esm/use-document-visibility/use-document-visibility.mjs
var import_react10 = __toESM(require_react(), 1);
function useDocumentVisibility() {
  const [documentVisibility, setDocumentVisibility] = (0, import_react10.useState)("visible");
  (0, import_react10.useEffect)(() => {
    setDocumentVisibility(document.visibilityState);
    const listener = () => setDocumentVisibility(document.visibilityState);
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);
  return documentVisibility;
}

// ../../node_modules/@mantine/hooks/esm/use-focus-return/use-focus-return.mjs
var import_react12 = __toESM(require_react(), 1);

// ../../node_modules/@mantine/hooks/esm/use-did-update/use-did-update.mjs
var import_react11 = __toESM(require_react(), 1);
function useDidUpdate(fn, dependencies) {
  const mounted = (0, import_react11.useRef)(false);
  (0, import_react11.useEffect)(
    () => () => {
      mounted.current = false;
    },
    []
  );
  (0, import_react11.useEffect)(() => {
    if (mounted.current) {
      return fn();
    }
    mounted.current = true;
    return void 0;
  }, dependencies);
}

// ../../node_modules/@mantine/hooks/esm/use-focus-return/use-focus-return.mjs
function useFocusReturn({
  opened,
  shouldReturnFocus = true
}) {
  const lastActiveElement = (0, import_react12.useRef)(null);
  const returnFocus = () => {
    if (lastActiveElement.current && "focus" in lastActiveElement.current && typeof lastActiveElement.current.focus === "function") {
      lastActiveElement.current?.focus({ preventScroll: true });
    }
  };
  useDidUpdate(() => {
    let timeout = -1;
    const clearFocusTimeout = (event) => {
      if (event.key === "Tab") {
        window.clearTimeout(timeout);
      }
    };
    document.addEventListener("keydown", clearFocusTimeout);
    if (opened) {
      lastActiveElement.current = document.activeElement;
    } else if (shouldReturnFocus) {
      timeout = window.setTimeout(returnFocus, 10);
    }
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", clearFocusTimeout);
    };
  }, [opened, shouldReturnFocus]);
  return returnFocus;
}

// ../../node_modules/@mantine/hooks/esm/use-focus-trap/use-focus-trap.mjs
var import_react13 = __toESM(require_react(), 1);

// ../../node_modules/@mantine/hooks/esm/use-focus-trap/tabbable.mjs
var TABBABLE_NODES = /input|select|textarea|button|object/;
var FOCUS_SELECTOR = "a, input, select, textarea, button, object, [tabindex]";
function hidden(element) {
  if (false) {
    return false;
  }
  return element.style.display === "none";
}
function visible(element) {
  const isHidden = element.getAttribute("aria-hidden") || element.getAttribute("hidden") || element.getAttribute("type") === "hidden";
  if (isHidden) {
    return false;
  }
  let parentElement = element;
  while (parentElement) {
    if (parentElement === document.body || parentElement.nodeType === 11) {
      break;
    }
    if (hidden(parentElement)) {
      return false;
    }
    parentElement = parentElement.parentNode;
  }
  return true;
}
function getElementTabIndex(element) {
  let tabIndex = element.getAttribute("tabindex");
  if (tabIndex === null) {
    tabIndex = void 0;
  }
  return parseInt(tabIndex, 10);
}
function focusable(element) {
  const nodeName = element.nodeName.toLowerCase();
  const isTabIndexNotNaN = !Number.isNaN(getElementTabIndex(element));
  const res = (
    // @ts-expect-error function accepts any html element but if it is a button, it should not be disabled to trigger the condition
    TABBABLE_NODES.test(nodeName) && !element.disabled || (element instanceof HTMLAnchorElement ? element.href || isTabIndexNotNaN : isTabIndexNotNaN)
  );
  return res && visible(element);
}
function tabbable(element) {
  const tabIndex = getElementTabIndex(element);
  const isTabIndexNaN = Number.isNaN(tabIndex);
  return (isTabIndexNaN || tabIndex >= 0) && focusable(element);
}
function findTabbableDescendants(element) {
  return Array.from(element.querySelectorAll(FOCUS_SELECTOR)).filter(tabbable);
}

// ../../node_modules/@mantine/hooks/esm/use-focus-trap/scope-tab.mjs
function scopeTab(node, event) {
  const tabbable2 = findTabbableDescendants(node);
  if (!tabbable2.length) {
    event.preventDefault();
    return;
  }
  const finalTabbable = tabbable2[event.shiftKey ? 0 : tabbable2.length - 1];
  const root = node.getRootNode();
  let leavingFinalTabbable = finalTabbable === root.activeElement || node === root.activeElement;
  const activeElement = root.activeElement;
  const activeElementIsRadio = activeElement.tagName === "INPUT" && activeElement.getAttribute("type") === "radio";
  if (activeElementIsRadio) {
    const activeRadioGroup = tabbable2.filter(
      (element) => element.getAttribute("type") === "radio" && element.getAttribute("name") === activeElement.getAttribute("name")
    );
    leavingFinalTabbable = activeRadioGroup.includes(finalTabbable);
  }
  if (!leavingFinalTabbable) {
    return;
  }
  event.preventDefault();
  const target = tabbable2[event.shiftKey ? tabbable2.length - 1 : 0];
  if (target) {
    target.focus();
  }
}

// ../../node_modules/@mantine/hooks/esm/use-focus-trap/use-focus-trap.mjs
function useFocusTrap(active = true) {
  const ref = (0, import_react13.useRef)(null);
  const focusNode = (node) => {
    let focusElement = node.querySelector("[data-autofocus]");
    if (!focusElement) {
      const children = Array.from(node.querySelectorAll(FOCUS_SELECTOR));
      focusElement = children.find(tabbable) || children.find(focusable) || null;
      if (!focusElement && focusable(node)) {
        focusElement = node;
      }
    }
    if (focusElement) {
      focusElement.focus({ preventScroll: true });
    } else if (true) {
      console.warn(
        "[@mantine/hooks/use-focus-trap] Failed to find focusable element within provided node",
        node
      );
    }
  };
  const setRef = (0, import_react13.useCallback)(
    (node) => {
      if (!active) {
        return;
      }
      if (node === null) {
        return;
      }
      if (ref.current === node) {
        return;
      }
      if (node) {
        setTimeout(() => {
          if (node.getRootNode()) {
            focusNode(node);
          } else if (true) {
            console.warn("[@mantine/hooks/use-focus-trap] Ref node is not part of the dom", node);
          }
        });
        ref.current = node;
      } else {
        ref.current = null;
      }
    },
    [active]
  );
  (0, import_react13.useEffect)(() => {
    if (!active) {
      return void 0;
    }
    ref.current && setTimeout(() => focusNode(ref.current));
    const handleKeyDown = (event) => {
      if (event.key === "Tab" && ref.current) {
        scopeTab(ref.current, event);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);
  return setRef;
}

// ../../node_modules/@mantine/hooks/esm/use-force-update/use-force-update.mjs
var import_react14 = __toESM(require_react(), 1);
var reducer = (value) => (value + 1) % 1e6;
function useForceUpdate() {
  const [, update] = (0, import_react14.useReducer)(reducer, 0);
  return update;
}

// ../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs
var import_react16 = __toESM(require_react(), 1);

// ../../node_modules/@mantine/hooks/esm/use-id/use-react-id.mjs
var import_react15 = __toESM(require_react(), 1);
var __useId = import_react15.default["useId".toString()] || (() => void 0);
function useReactId() {
  const id = __useId();
  return id ? `mantine-${id.replace(/:/g, "")}` : "";
}

// ../../node_modules/@mantine/hooks/esm/use-id/use-id.mjs
function useId(staticId) {
  const reactId = useReactId();
  const [uuid, setUuid] = (0, import_react16.useState)(reactId);
  useIsomorphicEffect(() => {
    setUuid(randomId());
  }, []);
  if (typeof staticId === "string") {
    return staticId;
  }
  if (typeof window === "undefined") {
    return reactId;
  }
  return uuid;
}

// ../../node_modules/@mantine/hooks/esm/use-idle/use-idle.mjs
var import_react17 = __toESM(require_react(), 1);
var DEFAULT_OPTIONS2 = {
  events: ["keydown", "mousemove", "touchmove", "click", "scroll", "wheel"],
  initialState: true
};
function useIdle(timeout, options) {
  const { events, initialState } = { ...DEFAULT_OPTIONS2, ...options };
  const [idle, setIdle] = (0, import_react17.useState)(initialState);
  const timer = (0, import_react17.useRef)(-1);
  (0, import_react17.useEffect)(() => {
    const handleEvents = () => {
      setIdle(false);
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => {
        setIdle(true);
      }, timeout);
    };
    events.forEach((event) => document.addEventListener(event, handleEvents));
    timer.current = window.setTimeout(() => {
      setIdle(true);
    }, timeout);
    return () => {
      events.forEach((event) => document.removeEventListener(event, handleEvents));
      window.clearTimeout(timer.current);
      timer.current = -1;
    };
  }, [timeout]);
  return idle;
}

// ../../node_modules/@mantine/hooks/esm/use-interval/use-interval.mjs
var import_react18 = __toESM(require_react(), 1);
function useInterval(fn, interval, { autoInvoke = false } = {}) {
  const [active, setActive] = (0, import_react18.useState)(false);
  const intervalRef = (0, import_react18.useRef)(null);
  const fnRef = (0, import_react18.useRef)(null);
  const start = (0, import_react18.useCallback)(() => {
    setActive((old) => {
      if (!old && (!intervalRef.current || intervalRef.current === -1)) {
        intervalRef.current = window.setInterval(fnRef.current, interval);
      }
      return true;
    });
  }, []);
  const stop = (0, import_react18.useCallback)(() => {
    setActive(false);
    window.clearInterval(intervalRef.current || -1);
    intervalRef.current = -1;
  }, []);
  const toggle = (0, import_react18.useCallback)(() => {
    if (active) {
      stop();
    } else {
      start();
    }
  }, [active]);
  (0, import_react18.useEffect)(() => {
    fnRef.current = fn;
    active && start();
    return stop;
  }, [fn, active, interval]);
  (0, import_react18.useEffect)(() => {
    if (autoInvoke) {
      start();
    }
  }, []);
  return { start, stop, toggle, active };
}

// ../../node_modules/@mantine/hooks/esm/use-list-state/use-list-state.mjs
var import_react19 = __toESM(require_react(), 1);
function useListState(initialValue = []) {
  const [state, setState] = (0, import_react19.useState)(initialValue);
  const append = (...items) => setState((current) => [...current, ...items]);
  const prepend = (...items) => setState((current) => [...items, ...current]);
  const insert = (index, ...items) => setState((current) => [...current.slice(0, index), ...items, ...current.slice(index)]);
  const apply = (fn) => setState((current) => current.map((item, index) => fn(item, index)));
  const remove = (...indices) => setState((current) => current.filter((_, index) => !indices.includes(index)));
  const pop = () => setState((current) => {
    const cloned = [...current];
    cloned.pop();
    return cloned;
  });
  const shift = () => setState((current) => {
    const cloned = [...current];
    cloned.shift();
    return cloned;
  });
  const reorder = ({ from, to }) => setState((current) => {
    const cloned = [...current];
    const item = current[from];
    cloned.splice(from, 1);
    cloned.splice(to, 0, item);
    return cloned;
  });
  const swap = ({ from, to }) => setState((current) => {
    const cloned = [...current];
    const fromItem = cloned[from];
    const toItem = cloned[to];
    cloned.splice(to, 1, fromItem);
    cloned.splice(from, 1, toItem);
    return cloned;
  });
  const setItem = (index, item) => setState((current) => {
    const cloned = [...current];
    cloned[index] = item;
    return cloned;
  });
  const setItemProp = (index, prop, value) => setState((current) => {
    const cloned = [...current];
    cloned[index] = { ...cloned[index], [prop]: value };
    return cloned;
  });
  const applyWhere = (condition, fn) => setState(
    (current) => current.map((item, index) => condition(item, index) ? fn(item, index) : item)
  );
  const filter = (fn) => {
    setState((current) => current.filter(fn));
  };
  return [
    state,
    {
      setState,
      append,
      prepend,
      insert,
      pop,
      shift,
      apply,
      applyWhere,
      remove,
      reorder,
      swap,
      setItem,
      setItemProp,
      filter
    }
  ];
}

// ../../node_modules/@mantine/hooks/esm/use-local-storage/create-storage.mjs
var import_react21 = __toESM(require_react(), 1);

// ../../node_modules/@mantine/hooks/esm/use-window-event/use-window-event.mjs
var import_react20 = __toESM(require_react(), 1);
function useWindowEvent(type, listener, options) {
  (0, import_react20.useEffect)(() => {
    window.addEventListener(type, listener, options);
    return () => window.removeEventListener(type, listener, options);
  }, [type, listener]);
}

// ../../node_modules/@mantine/hooks/esm/use-local-storage/create-storage.mjs
function serializeJSON(value, hookName = "use-local-storage") {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(`@mantine/hooks ${hookName}: Failed to serialize the value`);
  }
}
function deserializeJSON(value) {
  try {
    return value && JSON.parse(value);
  } catch {
    return value;
  }
}
function createStorageHandler(type) {
  const getItem = (key) => {
    try {
      return window[type].getItem(key);
    } catch (error) {
      console.warn("use-local-storage: Failed to get value from storage, localStorage is blocked");
      return null;
    }
  };
  const setItem = (key, value) => {
    try {
      window[type].setItem(key, value);
    } catch (error) {
      console.warn("use-local-storage: Failed to set value to storage, localStorage is blocked");
    }
  };
  const removeItem = (key) => {
    try {
      window[type].removeItem(key);
    } catch (error) {
      console.warn(
        "use-local-storage: Failed to remove value from storage, localStorage is blocked"
      );
    }
  };
  return { getItem, setItem, removeItem };
}
function createStorage(type, hookName) {
  const eventName = type === "localStorage" ? "mantine-local-storage" : "mantine-session-storage";
  const { getItem, setItem, removeItem } = createStorageHandler(type);
  return function useStorage({
    key,
    defaultValue,
    getInitialValueInEffect = true,
    sync = true,
    deserialize = deserializeJSON,
    serialize = (value) => serializeJSON(value, hookName)
  }) {
    const readStorageValue = (0, import_react21.useCallback)(
      (skipStorage) => {
        let storageBlockedOrSkipped;
        try {
          storageBlockedOrSkipped = typeof window === "undefined" || !(type in window) || window[type] === null || !!skipStorage;
        } catch (_e) {
          storageBlockedOrSkipped = true;
        }
        if (storageBlockedOrSkipped) {
          return defaultValue;
        }
        const storageValue = getItem(key);
        return storageValue !== null ? deserialize(storageValue) : defaultValue;
      },
      [key, defaultValue]
    );
    const [value, setValue] = (0, import_react21.useState)(readStorageValue(getInitialValueInEffect));
    const setStorageValue = (0, import_react21.useCallback)(
      (val) => {
        if (val instanceof Function) {
          setValue((current) => {
            const result = val(current);
            setItem(key, serialize(result));
            queueMicrotask(() => {
              window.dispatchEvent(
                new CustomEvent(eventName, { detail: { key, value: val(current) } })
              );
            });
            return result;
          });
        } else {
          setItem(key, serialize(val));
          window.dispatchEvent(new CustomEvent(eventName, { detail: { key, value: val } }));
          setValue(val);
        }
      },
      [key]
    );
    const removeStorageValue = (0, import_react21.useCallback)(() => {
      removeItem(key);
      setValue(defaultValue);
      window.dispatchEvent(new CustomEvent(eventName, { detail: { key, value: defaultValue } }));
    }, [key, defaultValue]);
    useWindowEvent("storage", (event) => {
      if (sync) {
        if (event.storageArea === window[type] && event.key === key) {
          setValue(deserialize(event.newValue ?? void 0));
        }
      }
    });
    useWindowEvent(eventName, (event) => {
      if (sync) {
        if (event.detail.key === key) {
          setValue(event.detail.value);
        }
      }
    });
    (0, import_react21.useEffect)(() => {
      if (defaultValue !== void 0 && value === void 0) {
        setStorageValue(defaultValue);
      }
    }, [defaultValue, value, setStorageValue]);
    (0, import_react21.useEffect)(() => {
      const val = readStorageValue();
      val !== void 0 && setStorageValue(val);
    }, [key]);
    return [value === void 0 ? defaultValue : value, setStorageValue, removeStorageValue];
  };
}
function readValue(type) {
  const { getItem } = createStorageHandler(type);
  return function read({
    key,
    defaultValue,
    deserialize = deserializeJSON
  }) {
    let storageBlockedOrSkipped;
    try {
      storageBlockedOrSkipped = typeof window === "undefined" || !(type in window) || window[type] === null;
    } catch (_e) {
      storageBlockedOrSkipped = true;
    }
    if (storageBlockedOrSkipped) {
      return defaultValue;
    }
    const storageValue = getItem(key);
    return storageValue !== null ? deserialize(storageValue) : defaultValue;
  };
}

// ../../node_modules/@mantine/hooks/esm/use-local-storage/use-local-storage.mjs
function useLocalStorage(props) {
  return createStorage("localStorage", "use-local-storage")(props);
}
var readLocalStorageValue = readValue("localStorage");

// ../../node_modules/@mantine/hooks/esm/use-session-storage/use-session-storage.mjs
function useSessionStorage(props) {
  return createStorage("sessionStorage", "use-session-storage")(props);
}
var readSessionStorageValue = readValue("sessionStorage");

// ../../node_modules/@mantine/hooks/esm/use-merged-ref/use-merged-ref.mjs
var import_react22 = __toESM(require_react(), 1);
function assignRef(ref, value) {
  if (typeof ref === "function") {
    return ref(value);
  } else if (typeof ref === "object" && ref !== null && "current" in ref) {
    ref.current = value;
  }
}
function mergeRefs(...refs) {
  const cleanupMap = /* @__PURE__ */ new Map();
  return (node) => {
    refs.forEach((ref) => {
      const cleanup = assignRef(ref, node);
      if (cleanup) {
        cleanupMap.set(ref, cleanup);
      }
    });
    if (cleanupMap.size > 0) {
      return () => {
        refs.forEach((ref) => {
          const cleanup = cleanupMap.get(ref);
          if (cleanup && typeof cleanup === "function") {
            cleanup();
          } else {
            assignRef(ref, null);
          }
        });
        cleanupMap.clear();
      };
    }
  };
}
function useMergedRef(...refs) {
  return (0, import_react22.useCallback)(mergeRefs(...refs), refs);
}

// ../../node_modules/@mantine/hooks/esm/use-mouse/use-mouse.mjs
var import_react23 = __toESM(require_react(), 1);
function useMouse(options = { resetOnExit: false }) {
  const [position, setPosition] = (0, import_react23.useState)({ x: 0, y: 0 });
  const ref = (0, import_react23.useRef)(null);
  const setMousePosition = (event) => {
    if (ref.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.round(event.pageX - rect.left - (window.scrollX || window.scrollX))
      );
      const y = Math.max(
        0,
        Math.round(event.pageY - rect.top - (window.scrollY || window.scrollY))
      );
      setPosition({ x, y });
    } else {
      setPosition({ x: event.clientX, y: event.clientY });
    }
  };
  const resetMousePosition = () => setPosition({ x: 0, y: 0 });
  (0, import_react23.useEffect)(() => {
    const element = ref?.current ? ref.current : document;
    element.addEventListener("mousemove", setMousePosition);
    if (options.resetOnExit) {
      element.addEventListener("mouseleave", resetMousePosition);
    }
    return () => {
      element.removeEventListener("mousemove", setMousePosition);
      if (options.resetOnExit) {
        element.removeEventListener("mouseleave", resetMousePosition);
      }
    };
  }, [ref.current]);
  return { ref, ...position };
}

// ../../node_modules/@mantine/hooks/esm/use-move/use-move.mjs
var import_react24 = __toESM(require_react(), 1);
function clampUseMovePosition(position) {
  return {
    x: clamp(position.x, 0, 1),
    y: clamp(position.y, 0, 1)
  };
}
function useMove(onChange, handlers, dir = "ltr") {
  const mounted = (0, import_react24.useRef)(false);
  const isSliding = (0, import_react24.useRef)(false);
  const frame = (0, import_react24.useRef)(0);
  const [active, setActive] = (0, import_react24.useState)(false);
  const cleanupRef = (0, import_react24.useRef)(null);
  (0, import_react24.useEffect)(() => {
    mounted.current = true;
  }, []);
  const refCallback = (0, import_react24.useCallback)(
    (node) => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (!node) {
        return;
      }
      const onScrub = ({ x, y }) => {
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          if (mounted.current && node) {
            node.style.userSelect = "none";
            const rect = node.getBoundingClientRect();
            if (rect.width && rect.height) {
              const _x = clamp((x - rect.left) / rect.width, 0, 1);
              onChange({
                x: dir === "ltr" ? _x : 1 - _x,
                y: clamp((y - rect.top) / rect.height, 0, 1)
              });
            }
          }
        });
      };
      const bindEvents = () => {
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", stopScrubbing);
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", stopScrubbing);
      };
      const unbindEvents = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", stopScrubbing);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", stopScrubbing);
      };
      const startScrubbing = () => {
        if (!isSliding.current && mounted.current) {
          isSliding.current = true;
          typeof handlers?.onScrubStart === "function" && handlers.onScrubStart();
          setActive(true);
          bindEvents();
        }
      };
      const stopScrubbing = () => {
        if (isSliding.current && mounted.current) {
          isSliding.current = false;
          setActive(false);
          unbindEvents();
          setTimeout(() => {
            typeof handlers?.onScrubEnd === "function" && handlers.onScrubEnd();
          }, 0);
        }
      };
      const onMouseDown = (event) => {
        startScrubbing();
        event.preventDefault();
        onMouseMove(event);
      };
      const onMouseMove = (event) => onScrub({ x: event.clientX, y: event.clientY });
      const onTouchStart = (event) => {
        if (event.cancelable) {
          event.preventDefault();
        }
        startScrubbing();
        onTouchMove(event);
      };
      const onTouchMove = (event) => {
        if (event.cancelable) {
          event.preventDefault();
        }
        onScrub({ x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY });
      };
      node.addEventListener("mousedown", onMouseDown);
      node.addEventListener("touchstart", onTouchStart, { passive: false });
      cleanupRef.current = () => {
        node.removeEventListener("mousedown", onMouseDown);
        node.removeEventListener("touchstart", onTouchStart);
      };
    },
    [dir, onChange]
  );
  return { ref: refCallback, active };
}

// ../../node_modules/@mantine/hooks/esm/use-pagination/use-pagination.mjs
var import_react26 = __toESM(require_react(), 1);

// ../../node_modules/@mantine/hooks/esm/use-uncontrolled/use-uncontrolled.mjs
var import_react25 = __toESM(require_react(), 1);
function useUncontrolled({
  value,
  defaultValue,
  finalValue,
  onChange = () => {
  }
}) {
  const [uncontrolledValue, setUncontrolledValue] = (0, import_react25.useState)(
    defaultValue !== void 0 ? defaultValue : finalValue
  );
  const handleUncontrolledChange = (val, ...payload) => {
    setUncontrolledValue(val);
    onChange?.(val, ...payload);
  };
  if (value !== void 0) {
    return [value, onChange, true];
  }
  return [uncontrolledValue, handleUncontrolledChange, false];
}

// ../../node_modules/@mantine/hooks/esm/use-pagination/use-pagination.mjs
function range2(start, end) {
  const length = end - start + 1;
  return Array.from({ length }, (_, index) => index + start);
}
var DOTS = "dots";
function usePagination({
  total,
  siblings = 1,
  boundaries = 1,
  page,
  initialPage = 1,
  onChange
}) {
  const _total = Math.max(Math.trunc(total), 0);
  const [activePage, setActivePage] = useUncontrolled({
    value: page,
    onChange,
    defaultValue: initialPage,
    finalValue: initialPage
  });
  const setPage = (pageNumber) => {
    if (pageNumber <= 0) {
      setActivePage(1);
    } else if (pageNumber > _total) {
      setActivePage(_total);
    } else {
      setActivePage(pageNumber);
    }
  };
  const next = () => setPage(activePage + 1);
  const previous = () => setPage(activePage - 1);
  const first = () => setPage(1);
  const last = () => setPage(_total);
  const paginationRange = (0, import_react26.useMemo)(() => {
    const totalPageNumbers = siblings * 2 + 3 + boundaries * 2;
    if (totalPageNumbers >= _total) {
      return range2(1, _total);
    }
    const leftSiblingIndex = Math.max(activePage - siblings, boundaries);
    const rightSiblingIndex = Math.min(activePage + siblings, _total - boundaries);
    const shouldShowLeftDots = leftSiblingIndex > boundaries + 2;
    const shouldShowRightDots = rightSiblingIndex < _total - (boundaries + 1);
    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftItemCount = siblings * 2 + boundaries + 2;
      return [...range2(1, leftItemCount), DOTS, ...range2(_total - (boundaries - 1), _total)];
    }
    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = boundaries + 1 + 2 * siblings;
      return [...range2(1, boundaries), DOTS, ...range2(_total - rightItemCount, _total)];
    }
    return [
      ...range2(1, boundaries),
      DOTS,
      ...range2(leftSiblingIndex, rightSiblingIndex),
      DOTS,
      ...range2(_total - boundaries + 1, _total)
    ];
  }, [_total, siblings, activePage]);
  return {
    range: paginationRange,
    active: activePage,
    setPage,
    next,
    previous,
    first,
    last
  };
}

// ../../node_modules/@mantine/hooks/esm/use-queue/use-queue.mjs
var import_react27 = __toESM(require_react(), 1);
function useQueue({
  initialValues = [],
  limit
}) {
  const [state, setState] = (0, import_react27.useState)({
    state: initialValues.slice(0, limit),
    queue: initialValues.slice(limit)
  });
  const add = (...items) => setState((current) => {
    const results = [...current.state, ...current.queue, ...items];
    return {
      state: results.slice(0, limit),
      queue: results.slice(limit)
    };
  });
  const update = (fn) => setState((current) => {
    const results = fn([...current.state, ...current.queue]);
    return {
      state: results.slice(0, limit),
      queue: results.slice(limit)
    };
  });
  const cleanQueue = () => setState((current) => ({ state: current.state, queue: [] }));
  return {
    state: state.state,
    queue: state.queue,
    add,
    update,
    cleanQueue
  };
}

// ../../node_modules/@mantine/hooks/esm/use-page-leave/use-page-leave.mjs
var import_react28 = __toESM(require_react(), 1);
function usePageLeave(onPageLeave) {
  (0, import_react28.useEffect)(() => {
    document.documentElement.addEventListener("mouseleave", onPageLeave);
    return () => document.documentElement.removeEventListener("mouseleave", onPageLeave);
  }, []);
}

// ../../node_modules/@mantine/hooks/esm/use-reduced-motion/use-reduced-motion.mjs
function useReducedMotion(initialValue, options) {
  return useMediaQuery("(prefers-reduced-motion: reduce)", initialValue, options);
}

// ../../node_modules/@mantine/hooks/esm/use-scroll-into-view/use-scroll-into-view.mjs
var import_react29 = __toESM(require_react(), 1);
function useScrollIntoView({
  duration = 1250,
  axis = "y",
  onScrollFinish,
  easing = easeInOutQuad,
  offset = 0,
  cancelable = true,
  isList = false
} = {}) {
  const frameID = (0, import_react29.useRef)(0);
  const startTime = (0, import_react29.useRef)(0);
  const shouldStop = (0, import_react29.useRef)(false);
  const scrollableRef = (0, import_react29.useRef)(null);
  const targetRef = (0, import_react29.useRef)(null);
  const reducedMotion = useReducedMotion();
  const cancel = () => {
    if (frameID.current) {
      cancelAnimationFrame(frameID.current);
    }
  };
  const scrollIntoView = (0, import_react29.useCallback)(
    ({ alignment = "start" } = {}) => {
      shouldStop.current = false;
      if (frameID.current) {
        cancel();
      }
      const start = getScrollStart({ parent: scrollableRef.current, axis }) ?? 0;
      const change = getRelativePosition({
        parent: scrollableRef.current,
        target: targetRef.current,
        axis,
        alignment,
        offset,
        isList
      }) - (scrollableRef.current ? 0 : start);
      function animateScroll() {
        if (startTime.current === 0) {
          startTime.current = performance.now();
        }
        const now = performance.now();
        const elapsed = now - startTime.current;
        const t = reducedMotion || duration === 0 ? 1 : elapsed / duration;
        const distance = start + change * easing(t);
        setScrollParam({
          parent: scrollableRef.current,
          axis,
          distance
        });
        if (!shouldStop.current && t < 1) {
          frameID.current = requestAnimationFrame(animateScroll);
        } else {
          typeof onScrollFinish === "function" && onScrollFinish();
          startTime.current = 0;
          frameID.current = 0;
          cancel();
        }
      }
      animateScroll();
    },
    [axis, duration, easing, isList, offset, onScrollFinish, reducedMotion]
  );
  const handleStop = () => {
    if (cancelable) {
      shouldStop.current = true;
    }
  };
  useWindowEvent("wheel", handleStop, {
    passive: true
  });
  useWindowEvent("touchmove", handleStop, {
    passive: true
  });
  (0, import_react29.useEffect)(() => cancel, []);
  return {
    scrollableRef,
    targetRef,
    scrollIntoView,
    cancel
  };
}
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
function getRelativePosition({ axis, target, parent, alignment, offset, isList }) {
  if (!target || !parent && typeof document === "undefined") {
    return 0;
  }
  const isCustomParent = !!parent;
  const parentElement = parent || document.body;
  const parentPosition = parentElement.getBoundingClientRect();
  const targetPosition = target.getBoundingClientRect();
  const getDiff = (property) => targetPosition[property] - parentPosition[property];
  if (axis === "y") {
    const diff = getDiff("top");
    if (diff === 0) {
      return 0;
    }
    if (alignment === "start") {
      const distance = diff - offset;
      const shouldScroll = distance <= targetPosition.height * (isList ? 0 : 1) || !isList;
      return shouldScroll ? distance : 0;
    }
    const parentHeight = isCustomParent ? parentPosition.height : window.innerHeight;
    if (alignment === "end") {
      const distance = diff + offset - parentHeight + targetPosition.height;
      const shouldScroll = distance >= -targetPosition.height * (isList ? 0 : 1) || !isList;
      return shouldScroll ? distance : 0;
    }
    if (alignment === "center") {
      return diff - parentHeight / 2 + targetPosition.height / 2;
    }
    return 0;
  }
  if (axis === "x") {
    const diff = getDiff("left");
    if (diff === 0) {
      return 0;
    }
    if (alignment === "start") {
      const distance = diff - offset;
      const shouldScroll = distance <= targetPosition.width || !isList;
      return shouldScroll ? distance : 0;
    }
    const parentWidth = isCustomParent ? parentPosition.width : window.innerWidth;
    if (alignment === "end") {
      const distance = diff + offset - parentWidth + targetPosition.width;
      const shouldScroll = distance >= -targetPosition.width || !isList;
      return shouldScroll ? distance : 0;
    }
    if (alignment === "center") {
      return diff - parentWidth / 2 + targetPosition.width / 2;
    }
    return 0;
  }
  return 0;
}
function getScrollStart({ axis, parent }) {
  if (!parent && typeof document === "undefined") {
    return 0;
  }
  const method = axis === "y" ? "scrollTop" : "scrollLeft";
  if (parent) {
    return parent[method];
  }
  const { body, documentElement } = document;
  return body[method] + documentElement[method];
}
function setScrollParam({ axis, parent, distance }) {
  if (!parent && typeof document === "undefined") {
    return;
  }
  const method = axis === "y" ? "scrollTop" : "scrollLeft";
  if (parent) {
    parent[method] = distance;
  } else {
    const { body, documentElement } = document;
    body[method] = distance;
    documentElement[method] = distance;
  }
}

// ../../node_modules/@mantine/hooks/esm/use-resize-observer/use-resize-observer.mjs
var import_react30 = __toESM(require_react(), 1);
var defaultState = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0
};
function useResizeObserver(options) {
  const frameID = (0, import_react30.useRef)(0);
  const ref = (0, import_react30.useRef)(null);
  const [rect, setRect] = (0, import_react30.useState)(defaultState);
  const observer = (0, import_react30.useMemo)(
    () => typeof window !== "undefined" ? new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        cancelAnimationFrame(frameID.current);
        frameID.current = requestAnimationFrame(() => {
          if (ref.current) {
            const boxSize = entry.borderBoxSize?.[0] || entry.contentBoxSize?.[0];
            if (boxSize) {
              const width = boxSize.inlineSize;
              const height = boxSize.blockSize;
              setRect({
                width,
                height,
                x: entry.contentRect.x,
                y: entry.contentRect.y,
                top: entry.contentRect.top,
                left: entry.contentRect.left,
                bottom: entry.contentRect.bottom,
                right: entry.contentRect.right
              });
            } else {
              setRect(entry.contentRect);
            }
          }
        });
      }
    }) : null,
    []
  );
  (0, import_react30.useEffect)(() => {
    if (ref.current) {
      observer?.observe(ref.current, options);
    }
    return () => {
      observer?.disconnect();
      if (frameID.current) {
        cancelAnimationFrame(frameID.current);
      }
    };
  }, [ref.current]);
  return [ref, rect];
}
function useElementSize(options) {
  const [ref, { width, height }] = useResizeObserver(options);
  return { ref, width, height };
}

// ../../node_modules/@mantine/hooks/esm/use-shallow-effect/use-shallow-effect.mjs
var import_react31 = __toESM(require_react(), 1);
function shallowCompare(prevValue, currValue) {
  if (!prevValue || !currValue) {
    return false;
  }
  if (prevValue === currValue) {
    return true;
  }
  if (prevValue.length !== currValue.length) {
    return false;
  }
  for (let i = 0; i < prevValue.length; i += 1) {
    if (!shallowEqual(prevValue[i], currValue[i])) {
      return false;
    }
  }
  return true;
}
function useShallowCompare(dependencies) {
  const ref = (0, import_react31.useRef)([]);
  const updateRef = (0, import_react31.useRef)(0);
  if (!shallowCompare(ref.current, dependencies)) {
    ref.current = dependencies;
    updateRef.current += 1;
  }
  return [updateRef.current];
}
function useShallowEffect(cb, dependencies) {
  (0, import_react31.useEffect)(cb, useShallowCompare(dependencies));
}

// ../../node_modules/@mantine/hooks/esm/use-toggle/use-toggle.mjs
var import_react32 = __toESM(require_react(), 1);
function useToggle(options = [false, true]) {
  const [[option], toggle] = (0, import_react32.useReducer)((state, action) => {
    const value = action instanceof Function ? action(state[0]) : action;
    const index = Math.abs(state.indexOf(value));
    return state.slice(index).concat(state.slice(0, index));
  }, options);
  return [option, toggle];
}

// ../../node_modules/@mantine/hooks/esm/use-viewport-size/use-viewport-size.mjs
var import_react33 = __toESM(require_react(), 1);
var eventListerOptions = {
  passive: true
};
function useViewportSize() {
  const [windowSize, setWindowSize] = (0, import_react33.useState)({
    width: 0,
    height: 0
  });
  const setSize = (0, import_react33.useCallback)(() => {
    setWindowSize({ width: window.innerWidth || 0, height: window.innerHeight || 0 });
  }, []);
  useWindowEvent("resize", setSize, eventListerOptions);
  useWindowEvent("orientationchange", setSize, eventListerOptions);
  (0, import_react33.useEffect)(setSize, []);
  return windowSize;
}

// ../../node_modules/@mantine/hooks/esm/use-window-scroll/use-window-scroll.mjs
var import_react34 = __toESM(require_react(), 1);
function getScrollPosition() {
  return typeof window !== "undefined" ? { x: window.scrollX, y: window.scrollY } : { x: 0, y: 0 };
}
function scrollTo({ x, y }) {
  if (typeof window !== "undefined") {
    const scrollOptions = { behavior: "smooth" };
    if (typeof x === "number") {
      scrollOptions.left = x;
    }
    if (typeof y === "number") {
      scrollOptions.top = y;
    }
    window.scrollTo(scrollOptions);
  }
}
function useWindowScroll() {
  const [position, setPosition] = (0, import_react34.useState)({ x: 0, y: 0 });
  useWindowEvent("scroll", () => setPosition(getScrollPosition()));
  useWindowEvent("resize", () => setPosition(getScrollPosition()));
  (0, import_react34.useEffect)(() => {
    setPosition(getScrollPosition());
  }, []);
  return [position, scrollTo];
}

// ../../node_modules/@mantine/hooks/esm/use-intersection/use-intersection.mjs
var import_react35 = __toESM(require_react(), 1);
function useIntersection(options) {
  const [entry, setEntry] = (0, import_react35.useState)(null);
  const observer = (0, import_react35.useRef)(null);
  const ref = (0, import_react35.useCallback)(
    (element) => {
      if (observer.current) {
        observer.current.disconnect();
        observer.current = null;
      }
      if (element === null) {
        setEntry(null);
        return;
      }
      observer.current = new IntersectionObserver(([_entry]) => {
        setEntry(_entry);
      }, options);
      observer.current.observe(element);
    },
    [options?.rootMargin, options?.root, options?.threshold]
  );
  return { ref, entry };
}

// ../../node_modules/@mantine/hooks/esm/use-hash/use-hash.mjs
var import_react36 = __toESM(require_react(), 1);
function useHash({
  getInitialValueInEffect = true
} = {}) {
  const [hash, setHash] = (0, import_react36.useState)(
    getInitialValueInEffect ? "" : window.location.hash || ""
  );
  const setHashHandler = (value) => {
    const valueWithHash = value.startsWith("#") ? value : `#${value}`;
    window.location.hash = valueWithHash;
    setHash(valueWithHash);
  };
  useWindowEvent("hashchange", () => {
    const newHash = window.location.hash;
    if (hash !== newHash) {
      setHash(newHash);
    }
  });
  (0, import_react36.useEffect)(() => {
    if (getInitialValueInEffect) {
      setHash(window.location.hash);
    }
  }, []);
  return [hash, setHashHandler];
}

// ../../node_modules/@mantine/hooks/esm/use-hotkeys/use-hotkeys.mjs
var import_react37 = __toESM(require_react(), 1);

// ../../node_modules/@mantine/hooks/esm/use-hotkeys/parse-hotkey.mjs
var keyNameMap = {
  " ": "space",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  Escape: "escape",
  Esc: "escape",
  esc: "escape",
  Enter: "enter",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  "+": "plus",
  "-": "minus",
  "*": "asterisk",
  "/": "slash"
};
function normalizeKey(key) {
  const lowerKey = key.replace("Key", "").toLowerCase();
  return keyNameMap[key] || lowerKey;
}
function parseHotkey(hotkey) {
  const keys = hotkey.toLowerCase().split("+").map((part) => part.trim());
  const modifiers = {
    alt: keys.includes("alt"),
    ctrl: keys.includes("ctrl"),
    meta: keys.includes("meta"),
    mod: keys.includes("mod"),
    shift: keys.includes("shift"),
    plus: keys.includes("[plus]")
  };
  const reservedKeys = ["alt", "ctrl", "meta", "shift", "mod"];
  const freeKey = keys.find((key) => !reservedKeys.includes(key));
  return {
    ...modifiers,
    key: freeKey === "[plus]" ? "+" : freeKey
  };
}
function isExactHotkey(hotkey, event, usePhysicalKeys) {
  const { alt, ctrl, meta, mod, shift, key } = hotkey;
  const { altKey, ctrlKey, metaKey, shiftKey, key: pressedKey, code: pressedCode } = event;
  if (alt !== altKey) {
    return false;
  }
  if (mod) {
    if (!ctrlKey && !metaKey) {
      return false;
    }
  } else {
    if (ctrl !== ctrlKey) {
      return false;
    }
    if (meta !== metaKey) {
      return false;
    }
  }
  if (shift !== shiftKey) {
    return false;
  }
  if (key && (usePhysicalKeys ? normalizeKey(pressedCode) === normalizeKey(key) : normalizeKey(pressedKey ?? pressedCode) === normalizeKey(key))) {
    return true;
  }
  return false;
}
function getHotkeyMatcher(hotkey, usePhysicalKeys) {
  return (event) => isExactHotkey(parseHotkey(hotkey), event, usePhysicalKeys);
}
function getHotkeyHandler(hotkeys) {
  return (event) => {
    const _event = "nativeEvent" in event ? event.nativeEvent : event;
    hotkeys.forEach(
      ([hotkey, handler, options = { preventDefault: true, usePhysicalKeys: false }]) => {
        if (getHotkeyMatcher(hotkey, options.usePhysicalKeys)(_event)) {
          if (options.preventDefault) {
            event.preventDefault();
          }
          handler(_event);
        }
      }
    );
  };
}

// ../../node_modules/@mantine/hooks/esm/use-hotkeys/use-hotkeys.mjs
function shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable = false) {
  if (event.target instanceof HTMLElement) {
    if (triggerOnContentEditable) {
      return !tagsToIgnore.includes(event.target.tagName);
    }
    return !event.target.isContentEditable && !tagsToIgnore.includes(event.target.tagName);
  }
  return true;
}
function useHotkeys(hotkeys, tagsToIgnore = ["INPUT", "TEXTAREA", "SELECT"], triggerOnContentEditable = false) {
  (0, import_react37.useEffect)(() => {
    const keydownListener = (event) => {
      hotkeys.forEach(
        ([hotkey, handler, options = { preventDefault: true, usePhysicalKeys: false }]) => {
          if (getHotkeyMatcher(hotkey, options.usePhysicalKeys)(event) && shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)) {
            if (options.preventDefault) {
              event.preventDefault();
            }
            handler(event);
          }
        }
      );
    };
    document.documentElement.addEventListener("keydown", keydownListener);
    return () => document.documentElement.removeEventListener("keydown", keydownListener);
  }, [hotkeys]);
}

// ../../node_modules/@mantine/hooks/esm/use-fullscreen/use-fullscreen.mjs
var import_react38 = __toESM(require_react(), 1);
function getFullscreenElement() {
  const _document = window.document;
  const fullscreenElement = _document.fullscreenElement || _document.webkitFullscreenElement || _document.mozFullScreenElement || _document.msFullscreenElement;
  return fullscreenElement;
}
function exitFullscreen() {
  const _document = window.document;
  if (typeof _document.exitFullscreen === "function") {
    return _document.exitFullscreen();
  }
  if (typeof _document.msExitFullscreen === "function") {
    return _document.msExitFullscreen();
  }
  if (typeof _document.webkitExitFullscreen === "function") {
    return _document.webkitExitFullscreen();
  }
  if (typeof _document.mozCancelFullScreen === "function") {
    return _document.mozCancelFullScreen();
  }
  return null;
}
function enterFullScreen(element) {
  const _element = element;
  return _element.requestFullscreen?.() || _element.msRequestFullscreen?.() || _element.webkitEnterFullscreen?.() || _element.webkitRequestFullscreen?.() || _element.mozRequestFullscreen?.();
}
var prefixes = ["", "webkit", "moz", "ms"];
function addEvents(element, {
  onFullScreen,
  onError
}) {
  prefixes.forEach((prefix) => {
    element.addEventListener(`${prefix}fullscreenchange`, onFullScreen);
    element.addEventListener(`${prefix}fullscreenerror`, onError);
  });
  return () => {
    prefixes.forEach((prefix) => {
      element.removeEventListener(`${prefix}fullscreenchange`, onFullScreen);
      element.removeEventListener(`${prefix}fullscreenerror`, onError);
    });
  };
}
function useFullscreen() {
  const [fullscreen, setFullscreen] = (0, import_react38.useState)(false);
  const _ref = (0, import_react38.useRef)(null);
  const handleFullscreenChange = (0, import_react38.useCallback)(
    (event) => {
      setFullscreen(event.target === getFullscreenElement());
    },
    [setFullscreen]
  );
  const handleFullscreenError = (0, import_react38.useCallback)(
    (event) => {
      setFullscreen(false);
      console.error(
        `[@mantine/hooks] use-fullscreen: Error attempting full-screen mode method: ${event} (${event.target})`
      );
    },
    [setFullscreen]
  );
  const toggle = (0, import_react38.useCallback)(async () => {
    if (!getFullscreenElement()) {
      await enterFullScreen(_ref.current);
    } else {
      await exitFullscreen();
    }
  }, []);
  const ref = (0, import_react38.useCallback)((element) => {
    if (element === null) {
      _ref.current = window.document.documentElement;
    } else {
      _ref.current = element;
    }
  }, []);
  (0, import_react38.useEffect)(() => {
    if (!_ref.current && window.document) {
      _ref.current = window.document.documentElement;
      return addEvents(_ref.current, {
        onFullScreen: handleFullscreenChange,
        onError: handleFullscreenError
      });
    }
    if (_ref.current) {
      return addEvents(_ref.current, {
        onFullScreen: handleFullscreenChange,
        onError: handleFullscreenError
      });
    }
    return void 0;
  }, [_ref.current]);
  return { ref, toggle, fullscreen };
}

// ../../node_modules/@mantine/hooks/esm/use-logger/use-logger.mjs
var import_react39 = __toESM(require_react(), 1);
function useLogger(componentName, props) {
  (0, import_react39.useEffect)(() => {
    console.log(`${componentName} mounted`, ...props);
    return () => console.log(`${componentName} unmounted`);
  }, []);
  useDidUpdate(() => {
    console.log(`${componentName} updated`, ...props);
  }, props);
  return null;
}

// ../../node_modules/@mantine/hooks/esm/use-hover/use-hover.mjs
var import_react40 = __toESM(require_react(), 1);
function useHover() {
  const [hovered, setHovered] = (0, import_react40.useState)(false);
  const previousNode = (0, import_react40.useRef)(null);
  const handleMouseEnter = (0, import_react40.useCallback)(() => {
    setHovered(true);
  }, []);
  const handleMouseLeave = (0, import_react40.useCallback)(() => {
    setHovered(false);
  }, []);
  const ref = (0, import_react40.useCallback)(
    (node) => {
      if (previousNode.current) {
        previousNode.current.removeEventListener("mouseenter", handleMouseEnter);
        previousNode.current.removeEventListener("mouseleave", handleMouseLeave);
      }
      if (node) {
        node.addEventListener("mouseenter", handleMouseEnter);
        node.addEventListener("mouseleave", handleMouseLeave);
      }
      previousNode.current = node;
    },
    [handleMouseEnter, handleMouseLeave]
  );
  return { ref, hovered };
}

// ../../node_modules/@mantine/hooks/esm/use-validated-state/use-validated-state.mjs
var import_react41 = __toESM(require_react(), 1);
function useValidatedState(initialValue, validate, initialValidationState) {
  const [value, setValue] = (0, import_react41.useState)(initialValue);
  const [lastValidValue, setLastValidValue] = (0, import_react41.useState)(
    validate(initialValue) ? initialValue : void 0
  );
  const [valid, setValid] = (0, import_react41.useState)(
    typeof initialValidationState === "boolean" ? initialValidationState : validate(initialValue)
  );
  const onChange = (val) => {
    if (validate(val)) {
      setLastValidValue(val);
      setValid(true);
    } else {
      setValid(false);
    }
    setValue(val);
  };
  return [{ value, lastValidValue, valid }, onChange];
}

// ../../node_modules/@mantine/hooks/esm/use-os/use-os.mjs
var import_react42 = __toESM(require_react(), 1);
function isMacOS(userAgent) {
  const macosPattern = /(Macintosh)|(MacIntel)|(MacPPC)|(Mac68K)/i;
  return macosPattern.test(userAgent);
}
function isIOS(userAgent) {
  const iosPattern = /(iPhone)|(iPad)|(iPod)/i;
  return iosPattern.test(userAgent);
}
function isWindows(userAgent) {
  const windowsPattern = /(Win32)|(Win64)|(Windows)|(WinCE)/i;
  return windowsPattern.test(userAgent);
}
function isAndroid(userAgent) {
  const androidPattern = /Android/i;
  return androidPattern.test(userAgent);
}
function isLinux(userAgent) {
  const linuxPattern = /Linux/i;
  return linuxPattern.test(userAgent);
}
function isChromeOS(userAgent) {
  const chromePattern = /CrOS/i;
  return chromePattern.test(userAgent);
}
function getOS() {
  if (typeof window === "undefined") {
    return "undetermined";
  }
  const { userAgent } = window.navigator;
  if (isIOS(userAgent) || isMacOS(userAgent) && "ontouchend" in document) {
    return "ios";
  }
  if (isMacOS(userAgent)) {
    return "macos";
  }
  if (isWindows(userAgent)) {
    return "windows";
  }
  if (isAndroid(userAgent)) {
    return "android";
  }
  if (isLinux(userAgent)) {
    return "linux";
  }
  if (isChromeOS(userAgent)) {
    return "chromeos";
  }
  return "undetermined";
}
function useOs(options = { getValueInEffect: true }) {
  const [value, setValue] = (0, import_react42.useState)(
    options.getValueInEffect ? "undetermined" : getOS()
  );
  useIsomorphicEffect(() => {
    if (options.getValueInEffect) {
      setValue(getOS);
    }
  }, []);
  return value;
}

// ../../node_modules/@mantine/hooks/esm/use-set-state/use-set-state.mjs
var import_react43 = __toESM(require_react(), 1);
function useSetState(initialState) {
  const [state, setState] = (0, import_react43.useState)(initialState);
  const _setState = (0, import_react43.useCallback)(
    (statePartial) => setState((current) => ({
      ...current,
      ...typeof statePartial === "function" ? statePartial(current) : statePartial
    })),
    []
  );
  return [state, _setState];
}

// ../../node_modules/@mantine/hooks/esm/use-input-state/use-input-state.mjs
var import_react44 = __toESM(require_react(), 1);
function getInputOnChange(setValue) {
  return (val) => {
    if (!val) {
      setValue(val);
    } else if (typeof val === "function") {
      setValue(val);
    } else if (typeof val === "object" && "nativeEvent" in val) {
      const { currentTarget } = val;
      if (currentTarget.type === "checkbox") {
        setValue(currentTarget.checked);
      } else {
        setValue(currentTarget.value);
      }
    } else {
      setValue(val);
    }
  };
}
function useInputState(initialState) {
  const [value, setValue] = (0, import_react44.useState)(initialState);
  return [value, getInputOnChange(setValue)];
}

// ../../node_modules/@mantine/hooks/esm/use-event-listener/use-event-listener.mjs
var import_react45 = __toESM(require_react(), 1);
function useEventListener(type, listener, options) {
  const previousListener = (0, import_react45.useRef)(null);
  const previousNode = (0, import_react45.useRef)(null);
  const callbackRef = (0, import_react45.useCallback)(
    (node) => {
      if (!node) {
        return;
      }
      if (previousNode.current && previousListener.current) {
        previousNode.current.removeEventListener(type, previousListener.current, options);
      }
      node.addEventListener(type, listener, options);
      previousNode.current = node;
      previousListener.current = listener;
    },
    [type, listener, options]
  );
  (0, import_react45.useEffect)(
    () => () => {
      if (previousNode.current && previousListener.current) {
        previousNode.current.removeEventListener(type, previousListener.current, options);
      }
    },
    [type, options]
  );
  return callbackRef;
}

// ../../node_modules/@mantine/hooks/esm/use-disclosure/use-disclosure.mjs
var import_react46 = __toESM(require_react(), 1);
function useDisclosure(initialState = false, options = {}) {
  const [opened, setOpened] = (0, import_react46.useState)(initialState);
  const open = (0, import_react46.useCallback)(() => {
    setOpened((isOpened) => {
      if (!isOpened) {
        options.onOpen?.();
        return true;
      }
      return isOpened;
    });
  }, [options.onOpen]);
  const close = (0, import_react46.useCallback)(() => {
    setOpened((isOpened) => {
      if (isOpened) {
        options.onClose?.();
        return false;
      }
      return isOpened;
    });
  }, [options.onClose]);
  const toggle = (0, import_react46.useCallback)(() => {
    opened ? close() : open();
  }, [close, open, opened]);
  return [opened, { open, close, toggle }];
}

// ../../node_modules/@mantine/hooks/esm/use-focus-within/use-focus-within.mjs
var import_react47 = __toESM(require_react(), 1);
function containsRelatedTarget(event) {
  if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof HTMLElement) {
    return event.currentTarget.contains(event.relatedTarget);
  }
  return false;
}
function useFocusWithin({
  onBlur,
  onFocus
} = {}) {
  const [focused, setFocused] = (0, import_react47.useState)(false);
  const focusedRef = (0, import_react47.useRef)(false);
  const previousNode = (0, import_react47.useRef)(null);
  const onFocusRef = useCallbackRef(onFocus);
  const onBlurRef = useCallbackRef(onBlur);
  const _setFocused = (0, import_react47.useCallback)((value) => {
    setFocused(value);
    focusedRef.current = value;
  }, []);
  const handleFocusIn = (0, import_react47.useCallback)((event) => {
    if (!focusedRef.current) {
      _setFocused(true);
      onFocusRef(event);
    }
  }, []);
  const handleFocusOut = (0, import_react47.useCallback)((event) => {
    if (focusedRef.current && !containsRelatedTarget(event)) {
      _setFocused(false);
      onBlurRef(event);
    }
  }, []);
  const callbackRef = (0, import_react47.useCallback)(
    (node) => {
      if (!node) {
        return;
      }
      if (previousNode.current) {
        previousNode.current.removeEventListener("focusin", handleFocusIn);
        previousNode.current.removeEventListener("focusout", handleFocusOut);
      }
      node.addEventListener("focusin", handleFocusIn);
      node.addEventListener("focusout", handleFocusOut);
      previousNode.current = node;
    },
    [handleFocusIn, handleFocusOut]
  );
  (0, import_react47.useEffect)(
    () => () => {
      if (previousNode.current) {
        previousNode.current.removeEventListener("focusin", handleFocusIn);
        previousNode.current.removeEventListener("focusout", handleFocusOut);
      }
    },
    []
  );
  return { ref: callbackRef, focused };
}

// ../../node_modules/@mantine/hooks/esm/use-network/use-network.mjs
var import_react48 = __toESM(require_react(), 1);
function getConnection() {
  if (typeof navigator === "undefined") {
    return {};
  }
  const _navigator = navigator;
  const connection = _navigator.connection || _navigator.mozConnection || _navigator.webkitConnection;
  if (!connection) {
    return {};
  }
  return {
    downlink: connection?.downlink,
    downlinkMax: connection?.downlinkMax,
    effectiveType: connection?.effectiveType,
    rtt: connection?.rtt,
    saveData: connection?.saveData,
    type: connection?.type
  };
}
function useNetwork() {
  const [status, setStatus] = (0, import_react48.useState)({ online: true });
  const handleConnectionChange = (0, import_react48.useCallback)(
    () => setStatus((current) => ({ ...current, ...getConnection() })),
    []
  );
  useWindowEvent("online", () => setStatus({ online: true, ...getConnection() }));
  useWindowEvent("offline", () => setStatus({ online: false, ...getConnection() }));
  (0, import_react48.useEffect)(() => {
    const _navigator = navigator;
    if (_navigator.connection) {
      setStatus({ online: _navigator.onLine, ...getConnection() });
      _navigator.connection.addEventListener("change", handleConnectionChange);
      return () => _navigator.connection.removeEventListener("change", handleConnectionChange);
    }
    if (typeof _navigator.onLine === "boolean") {
      setStatus((current) => ({ ...current, online: _navigator.onLine }));
    }
    return void 0;
  }, []);
  return status;
}

// ../../node_modules/@mantine/hooks/esm/use-timeout/use-timeout.mjs
var import_react49 = __toESM(require_react(), 1);
function useTimeout(callback, delay, options = { autoInvoke: false }) {
  const timeoutRef = (0, import_react49.useRef)(null);
  const start = (0, import_react49.useCallback)(
    (...args) => {
      if (!timeoutRef.current) {
        timeoutRef.current = window.setTimeout(() => {
          callback(args);
          timeoutRef.current = null;
        }, delay);
      }
    },
    [delay]
  );
  const clear = (0, import_react49.useCallback)(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);
  (0, import_react49.useEffect)(() => {
    if (options.autoInvoke) {
      start();
    }
    return clear;
  }, [clear, start]);
  return { start, clear };
}

// ../../node_modules/@mantine/hooks/esm/use-text-selection/use-text-selection.mjs
var import_react50 = __toESM(require_react(), 1);
function useTextSelection() {
  const forceUpdate = useForceUpdate();
  const [selection, setSelection] = (0, import_react50.useState)(null);
  const handleSelectionChange = () => {
    setSelection(document.getSelection());
    forceUpdate();
  };
  (0, import_react50.useEffect)(() => {
    setSelection(document.getSelection());
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);
  return selection;
}

// ../../node_modules/@mantine/hooks/esm/use-previous/use-previous.mjs
var import_react51 = __toESM(require_react(), 1);
function usePrevious(value) {
  const ref = (0, import_react51.useRef)(void 0);
  (0, import_react51.useEffect)(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

// ../../node_modules/@mantine/hooks/esm/use-favicon/use-favicon.mjs
var import_react52 = __toESM(require_react(), 1);
var MIME_TYPES = {
  ico: "image/x-icon",
  png: "image/png",
  svg: "image/svg+xml",
  gif: "image/gif"
};
function useFavicon(url) {
  const link = (0, import_react52.useRef)(null);
  useIsomorphicEffect(() => {
    if (!url) {
      return;
    }
    if (!link.current) {
      const existingElements = document.querySelectorAll('link[rel*="icon"]');
      existingElements.forEach((element2) => document.head.removeChild(element2));
      const element = document.createElement("link");
      element.rel = "shortcut icon";
      link.current = element;
      document.querySelector("head").appendChild(element);
    }
    const splittedUrl = url.split(".");
    link.current.setAttribute(
      "type",
      MIME_TYPES[splittedUrl[splittedUrl.length - 1].toLowerCase()]
    );
    link.current.setAttribute("href", url);
  }, [url]);
}

// ../../node_modules/@mantine/hooks/esm/use-headroom/use-headroom.mjs
var import_react53 = __toESM(require_react(), 1);
var isFixed = (current, fixedAt) => current <= fixedAt;
var isPinnedOrReleased = (current, fixedAt, isCurrentlyPinnedRef, isScrollingUp, onPin, onRelease) => {
  const isInFixedPosition = isFixed(current, fixedAt);
  if (isInFixedPosition && !isCurrentlyPinnedRef.current) {
    isCurrentlyPinnedRef.current = true;
    onPin?.();
  } else if (!isInFixedPosition && isScrollingUp && !isCurrentlyPinnedRef.current) {
    isCurrentlyPinnedRef.current = true;
    onPin?.();
  } else if (!isInFixedPosition && isCurrentlyPinnedRef.current) {
    isCurrentlyPinnedRef.current = false;
    onRelease?.();
  }
};
var useScrollDirection = () => {
  const [lastScrollTop, setLastScrollTop] = (0, import_react53.useState)(0);
  const [isScrollingUp, setIsScrollingUp] = (0, import_react53.useState)(false);
  const [isResizing, setIsResizing] = (0, import_react53.useState)(false);
  (0, import_react53.useEffect)(() => {
    let resizeTimer;
    const onResize = () => {
      setIsResizing(true);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setIsResizing(false);
      }, 300);
    };
    const onScroll = () => {
      if (isResizing) {
        return;
      }
      const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
      setIsScrollingUp(currentScrollTop < lastScrollTop);
      setLastScrollTop(currentScrollTop);
    };
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [lastScrollTop, isResizing]);
  return isScrollingUp;
};
function useHeadroom({ fixedAt = 0, onPin, onFix, onRelease } = {}) {
  const isCurrentlyPinnedRef = (0, import_react53.useRef)(false);
  const isScrollingUp = useScrollDirection();
  const [{ y: scrollPosition }] = useWindowScroll();
  useIsomorphicEffect(() => {
    isPinnedOrReleased(
      scrollPosition,
      fixedAt,
      isCurrentlyPinnedRef,
      isScrollingUp,
      onPin,
      onRelease
    );
  }, [scrollPosition]);
  useIsomorphicEffect(() => {
    if (isFixed(scrollPosition, fixedAt)) {
      onFix?.();
    }
  }, [scrollPosition, fixedAt, onFix]);
  if (isFixed(scrollPosition, fixedAt) || isScrollingUp) {
    return true;
  }
  return false;
}

// ../../node_modules/@mantine/hooks/esm/use-eye-dropper/use-eye-dropper.mjs
var import_react54 = __toESM(require_react(), 1);
function useEyeDropper() {
  const [supported, setSupported] = (0, import_react54.useState)(false);
  useIsomorphicEffect(() => {
    setSupported(typeof window !== "undefined" && !isOpera() && "EyeDropper" in window);
  }, []);
  const open = (0, import_react54.useCallback)(
    (options = {}) => {
      if (supported) {
        const eyeDropper = new window.EyeDropper();
        return eyeDropper.open(options);
      }
      return Promise.resolve(void 0);
    },
    [supported]
  );
  return { supported, open };
}
function isOpera() {
  return navigator.userAgent.includes("OPR");
}

// ../../node_modules/@mantine/hooks/esm/use-in-viewport/use-in-viewport.mjs
var import_react55 = __toESM(require_react(), 1);
function useInViewport() {
  const observer = (0, import_react55.useRef)(null);
  const [inViewport, setInViewport] = (0, import_react55.useState)(false);
  const ref = (0, import_react55.useCallback)((node) => {
    if (typeof IntersectionObserver !== "undefined") {
      if (node && !observer.current) {
        observer.current = new IntersectionObserver((entries) => {
          const lastEntry = entries[entries.length - 1];
          setInViewport(lastEntry.isIntersecting);
        });
      } else {
        observer.current?.disconnect();
      }
      if (node) {
        observer.current?.observe(node);
      } else {
        setInViewport(false);
      }
    }
  }, []);
  return { ref, inViewport };
}

// ../../node_modules/@mantine/hooks/esm/use-mutation-observer/use-mutation-observer.mjs
var import_react56 = __toESM(require_react(), 1);
function useMutationObserver(callback, options, target) {
  const observer = (0, import_react56.useRef)(null);
  const ref = (0, import_react56.useRef)(null);
  (0, import_react56.useEffect)(() => {
    const targetElement = typeof target === "function" ? target() : target;
    if (targetElement || ref.current) {
      observer.current = new MutationObserver(callback);
      observer.current.observe(targetElement || ref.current, options);
    }
    return () => {
      observer.current?.disconnect();
    };
  }, [callback, options]);
  return ref;
}

// ../../node_modules/@mantine/hooks/esm/use-mounted/use-mounted.mjs
var import_react57 = __toESM(require_react(), 1);
function useMounted() {
  const [mounted, setMounted] = (0, import_react57.useState)(false);
  (0, import_react57.useEffect)(() => setMounted(true), []);
  return mounted;
}

// ../../node_modules/@mantine/hooks/esm/use-state-history/use-state-history.mjs
var import_react58 = __toESM(require_react(), 1);
function useStateHistory(initialValue) {
  const [state, setState] = (0, import_react58.useState)({
    history: [initialValue],
    current: 0
  });
  const set = (0, import_react58.useCallback)(
    (val) => setState((currentState) => {
      const nextState = [...currentState.history.slice(0, currentState.current + 1), val];
      return {
        history: nextState,
        current: nextState.length - 1
      };
    }),
    []
  );
  const back = (0, import_react58.useCallback)(
    (steps = 1) => setState((currentState) => ({
      history: currentState.history,
      current: Math.max(0, currentState.current - steps)
    })),
    []
  );
  const forward = (0, import_react58.useCallback)(
    (steps = 1) => setState((currentState) => ({
      history: currentState.history,
      current: Math.min(currentState.history.length - 1, currentState.current + steps)
    })),
    []
  );
  const reset = (0, import_react58.useCallback)(() => {
    setState({ history: [initialValue], current: 0 });
  }, [initialValue]);
  const handlers = (0, import_react58.useMemo)(() => ({ back, forward, reset, set }), [back, forward, reset, set]);
  return [state.history[state.current], handlers, state];
}

// ../../node_modules/@mantine/hooks/esm/use-map/use-map.mjs
var import_react59 = __toESM(require_react(), 1);
function useMap(initialState) {
  const mapRef = (0, import_react59.useRef)(new Map(initialState));
  const forceUpdate = useForceUpdate();
  mapRef.current.set = (...args) => {
    Map.prototype.set.apply(mapRef.current, args);
    forceUpdate();
    return mapRef.current;
  };
  mapRef.current.clear = (...args) => {
    Map.prototype.clear.apply(mapRef.current, args);
    forceUpdate();
  };
  mapRef.current.delete = (...args) => {
    const res = Map.prototype.delete.apply(mapRef.current, args);
    forceUpdate();
    return res;
  };
  return mapRef.current;
}

// ../../node_modules/@mantine/hooks/esm/use-set/use-set.mjs
var import_react60 = __toESM(require_react(), 1);
function readonlySetLikeToSet(input) {
  if (input instanceof Set) {
    return input;
  }
  const result = /* @__PURE__ */ new Set();
  for (const item of input) {
    result.add(item);
  }
  return result;
}
function useSet(values) {
  const setRef = (0, import_react60.useRef)(new Set(values));
  const forceUpdate = useForceUpdate();
  setRef.current.add = (...args) => {
    const res = Set.prototype.add.apply(setRef.current, args);
    forceUpdate();
    return res;
  };
  setRef.current.clear = (...args) => {
    Set.prototype.clear.apply(setRef.current, args);
    forceUpdate();
  };
  setRef.current.delete = (...args) => {
    const res = Set.prototype.delete.apply(setRef.current, args);
    forceUpdate();
    return res;
  };
  setRef.current.union = (other) => {
    const result = new Set(setRef.current);
    readonlySetLikeToSet(other).forEach((item) => result.add(item));
    return result;
  };
  setRef.current.intersection = (other) => {
    const result = /* @__PURE__ */ new Set();
    const otherSet = readonlySetLikeToSet(other);
    setRef.current.forEach((item) => {
      if (otherSet.has(item)) {
        result.add(item);
      }
    });
    return result;
  };
  setRef.current.difference = (other) => {
    const result = /* @__PURE__ */ new Set();
    const otherSet = readonlySetLikeToSet(other);
    setRef.current.forEach((item) => {
      if (!otherSet.has(item)) {
        result.add(item);
      }
    });
    return result;
  };
  setRef.current.symmetricDifference = (other) => {
    const result = /* @__PURE__ */ new Set();
    const otherSet = readonlySetLikeToSet(other);
    setRef.current.forEach((item) => {
      if (!otherSet.has(item)) {
        result.add(item);
      }
    });
    otherSet.forEach((item) => {
      if (!setRef.current.has(item)) {
        result.add(item);
      }
    });
    return result;
  };
  return setRef.current;
}

// ../../node_modules/@mantine/hooks/esm/use-throttled-callback/use-throttled-callback.mjs
var import_react61 = __toESM(require_react(), 1);
function useThrottledCallbackWithClearTimeout(callback, wait) {
  const handleCallback = useCallbackRef(callback);
  const latestInArgsRef = (0, import_react61.useRef)(null);
  const latestOutArgsRef = (0, import_react61.useRef)(null);
  const active = (0, import_react61.useRef)(true);
  const waitRef = (0, import_react61.useRef)(wait);
  const timeoutRef = (0, import_react61.useRef)(-1);
  const clearTimeout2 = () => window.clearTimeout(timeoutRef.current);
  const callThrottledCallback = (0, import_react61.useCallback)(
    (...args) => {
      handleCallback(...args);
      latestInArgsRef.current = args;
      latestOutArgsRef.current = args;
      active.current = false;
    },
    [handleCallback]
  );
  const timerCallback = (0, import_react61.useCallback)(() => {
    if (latestInArgsRef.current && latestInArgsRef.current !== latestOutArgsRef.current) {
      callThrottledCallback(...latestInArgsRef.current);
      timeoutRef.current = window.setTimeout(timerCallback, waitRef.current);
    } else {
      active.current = true;
    }
  }, [callThrottledCallback]);
  const throttled = (0, import_react61.useCallback)(
    (...args) => {
      if (active.current) {
        callThrottledCallback(...args);
        timeoutRef.current = window.setTimeout(timerCallback, waitRef.current);
      } else {
        latestInArgsRef.current = args;
      }
    },
    [callThrottledCallback, timerCallback]
  );
  (0, import_react61.useEffect)(() => {
    waitRef.current = wait;
  }, [wait]);
  return [throttled, clearTimeout2];
}
function useThrottledCallback(callback, wait) {
  return useThrottledCallbackWithClearTimeout(callback, wait)[0];
}

// ../../node_modules/@mantine/hooks/esm/use-throttled-state/use-throttled-state.mjs
var import_react62 = __toESM(require_react(), 1);
function useThrottledState(defaultValue, wait) {
  const [value, setValue] = (0, import_react62.useState)(defaultValue);
  const [setThrottledValue, clearTimeout2] = useThrottledCallbackWithClearTimeout(setValue, wait);
  (0, import_react62.useEffect)(() => clearTimeout2, []);
  return [value, setThrottledValue];
}

// ../../node_modules/@mantine/hooks/esm/use-throttled-value/use-throttled-value.mjs
var import_react63 = __toESM(require_react(), 1);
function useThrottledValue(value, wait) {
  const [throttledValue, setThrottledValue] = (0, import_react63.useState)(value);
  const valueRef = (0, import_react63.useRef)(value);
  const [throttledSetValue, clearTimeout2] = useThrottledCallbackWithClearTimeout(
    setThrottledValue,
    wait
  );
  (0, import_react63.useEffect)(() => {
    if (value !== valueRef.current) {
      valueRef.current = value;
      throttledSetValue(value);
    }
  }, [throttledSetValue, value]);
  (0, import_react63.useEffect)(() => clearTimeout2, []);
  return throttledValue;
}

// ../../node_modules/@mantine/hooks/esm/use-is-first-render/use-is-first-render.mjs
var import_react64 = __toESM(require_react(), 1);
function useIsFirstRender() {
  const renderRef = (0, import_react64.useRef)(true);
  if (renderRef.current === true) {
    renderRef.current = false;
    return true;
  }
  return renderRef.current;
}

// ../../node_modules/@mantine/hooks/esm/use-orientation/use-orientation.mjs
var import_react65 = __toESM(require_react(), 1);
function getInitialValue2(initialValue, getInitialValueInEffect) {
  if (getInitialValueInEffect) {
    return initialValue;
  }
  if (typeof window !== "undefined" && "screen" in window) {
    return {
      angle: window.screen.orientation?.angle ?? initialValue.angle,
      type: window.screen.orientation?.type ?? initialValue.type
    };
  }
  return initialValue;
}
function useOrientation({
  defaultAngle = 0,
  defaultType = "landscape-primary",
  getInitialValueInEffect = true
} = {}) {
  const [orientation, setOrientation] = (0, import_react65.useState)(
    getInitialValue2(
      {
        angle: defaultAngle,
        type: defaultType
      },
      getInitialValueInEffect
    )
  );
  const handleOrientationChange = (event) => {
    const target = event.currentTarget;
    setOrientation({ angle: target?.angle || 0, type: target?.type || "landscape-primary" });
  };
  useIsomorphicEffect(() => {
    window.screen.orientation?.addEventListener("change", handleOrientationChange);
    return () => window.screen.orientation?.removeEventListener("change", handleOrientationChange);
  }, []);
  return orientation;
}

// ../../node_modules/@mantine/hooks/esm/use-fetch/use-fetch.mjs
var import_react66 = __toESM(require_react(), 1);
function useFetch(url, { autoInvoke = true, ...options } = {}) {
  const [data, setData] = (0, import_react66.useState)(null);
  const [loading, setLoading] = (0, import_react66.useState)(false);
  const [error, setError] = (0, import_react66.useState)(null);
  const controller = (0, import_react66.useRef)(null);
  const refetch = (0, import_react66.useCallback)(() => {
    if (controller.current) {
      controller.current.abort();
    }
    controller.current = new AbortController();
    setLoading(true);
    return fetch(url, { signal: controller.current.signal, ...options }).then((res) => res.json()).then((res) => {
      setData(res);
      setLoading(false);
      return res;
    }).catch((err) => {
      setLoading(false);
      if (err.name !== "AbortError") {
        setError(err);
      }
      return err;
    });
  }, [url]);
  const abort = (0, import_react66.useCallback)(() => {
    if (controller.current) {
      controller.current?.abort("");
    }
  }, []);
  (0, import_react66.useEffect)(() => {
    if (autoInvoke) {
      refetch();
    }
    return () => {
      if (controller.current) {
        controller.current.abort("");
      }
    };
  }, [refetch, autoInvoke]);
  return { data, loading, error, refetch, abort };
}

// ../../node_modules/@mantine/hooks/esm/use-radial-move/use-radial-move.mjs
var import_react67 = __toESM(require_react(), 1);
function radiansToDegrees(radians) {
  return radians * (180 / Math.PI);
}
function getElementCenter(element) {
  const rect = element.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}
function getAngle(coordinates, element) {
  const center = getElementCenter(element);
  const x = coordinates[0] - center[0];
  const y = coordinates[1] - center[1];
  const deg = radiansToDegrees(Math.atan2(x, y)) + 180;
  return 360 - deg;
}
function toFixed(value, digits) {
  return parseFloat(value.toFixed(digits));
}
function getDigitsAfterDot(value) {
  return value.toString().split(".")[1]?.length || 0;
}
function normalizeRadialValue(degree, step) {
  const clamped = clamp(degree, 0, 360);
  const high = Math.ceil(clamped / step);
  const low = Math.round(clamped / step);
  return toFixed(
    high >= clamped / step ? high * step === 360 ? 0 : high * step : low * step,
    getDigitsAfterDot(step)
  );
}
function useRadialMove(onChange, { step = 0.01, onChangeEnd, onScrubStart, onScrubEnd } = {}) {
  const mounted = (0, import_react67.useRef)(false);
  const [active, setActive] = (0, import_react67.useState)(false);
  (0, import_react67.useEffect)(() => {
    mounted.current = true;
  }, []);
  const refCallback = (0, import_react67.useCallback)(
    (node) => {
      const update = (event, done = false) => {
        if (node) {
          node.style.userSelect = "none";
          const deg = getAngle([event.clientX, event.clientY], node);
          const newValue = normalizeRadialValue(deg, step || 1);
          onChange(newValue);
          done && onChangeEnd?.(newValue);
        }
      };
      const beginTracking = () => {
        onScrubStart?.();
        setActive(true);
        document.addEventListener("mousemove", handleMouseMove, false);
        document.addEventListener("mouseup", handleMouseUp, false);
        document.addEventListener("touchmove", handleTouchMove, { passive: false });
        document.addEventListener("touchend", handleTouchEnd, false);
      };
      const endTracking = () => {
        onScrubEnd?.();
        setActive(false);
        document.removeEventListener("mousemove", handleMouseMove, false);
        document.removeEventListener("mouseup", handleMouseUp, false);
        document.removeEventListener("touchmove", handleTouchMove, false);
        document.removeEventListener("touchend", handleTouchEnd, false);
      };
      const onMouseDown = (event) => {
        beginTracking();
        update(event);
      };
      const handleMouseMove = (event) => {
        update(event);
      };
      const handleMouseUp = (event) => {
        update(event, true);
        endTracking();
      };
      const handleTouchMove = (event) => {
        event.preventDefault();
        update(event.touches[0]);
      };
      const handleTouchEnd = (event) => {
        update(event.changedTouches[0], true);
        endTracking();
      };
      const handleTouchStart = (event) => {
        event.preventDefault();
        beginTracking();
        update(event.touches[0]);
      };
      node?.addEventListener("mousedown", onMouseDown);
      node?.addEventListener("touchstart", handleTouchStart, { passive: false });
      return () => {
        if (node) {
          node.removeEventListener("mousedown", onMouseDown);
          node.removeEventListener("touchstart", handleTouchStart);
        }
      };
    },
    [onChange]
  );
  return { ref: refCallback, active };
}

// ../../node_modules/@mantine/hooks/esm/use-scroll-spy/use-scroll-spy.mjs
var import_react68 = __toESM(require_react(), 1);
function getHeadingsData(headings, getDepth, getValue) {
  const result = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    result.push({
      depth: getDepth(heading),
      value: getValue(heading),
      id: heading.id || randomId(),
      getNode: () => heading.id ? document.getElementById(heading.id) : heading
    });
  }
  return result;
}
function getActiveElement(rects, offset = 0) {
  if (rects.length === 0) {
    return -1;
  }
  const closest = rects.reduce(
    (acc, item, index) => {
      if (Math.abs(acc.position - offset) < Math.abs(item.y - offset)) {
        return acc;
      }
      return {
        index,
        position: item.y
      };
    },
    { index: 0, position: rects[0].y }
  );
  return closest.index;
}
function getDefaultDepth(element) {
  return Number(element.tagName[1]);
}
function getDefaultValue(element) {
  return element.textContent || "";
}
function useScrollSpy({
  selector = "h1, h2, h3, h4, h5, h6",
  getDepth = getDefaultDepth,
  getValue = getDefaultValue,
  offset = 0,
  scrollHost
} = {}) {
  const [active, setActive] = (0, import_react68.useState)(-1);
  const [initialized, setInitialized] = (0, import_react68.useState)(false);
  const [data, setData] = (0, import_react68.useState)([]);
  const headingsRef = (0, import_react68.useRef)([]);
  const handleScroll = () => {
    setActive(
      getActiveElement(
        headingsRef.current.map((d) => d.getNode().getBoundingClientRect()),
        offset
      )
    );
  };
  const initialize = () => {
    const headings = getHeadingsData(
      Array.from(document.querySelectorAll(selector)),
      getDepth,
      getValue
    );
    headingsRef.current = headings;
    setInitialized(true);
    setData(headings);
    setActive(
      getActiveElement(
        headings.map((d) => d.getNode().getBoundingClientRect()),
        offset
      )
    );
  };
  (0, import_react68.useEffect)(() => {
    initialize();
    const _scrollHost = scrollHost || window;
    _scrollHost.addEventListener("scroll", handleScroll);
    return () => _scrollHost.removeEventListener("scroll", handleScroll);
  }, [scrollHost]);
  return {
    reinitialize: initialize,
    active,
    initialized,
    data
  };
}

// ../../node_modules/@mantine/hooks/esm/use-file-dialog/use-file-dialog.mjs
var import_react69 = __toESM(require_react(), 1);
var defaultOptions = {
  multiple: true,
  accept: "*"
};
function getInitialFilesList(files) {
  if (!files) {
    return null;
  }
  if (files instanceof FileList) {
    return files;
  }
  const result = new DataTransfer();
  for (const file of files) {
    result.items.add(file);
  }
  return result.files;
}
function createInput(options) {
  if (typeof document === "undefined") {
    return null;
  }
  const input = document.createElement("input");
  input.type = "file";
  if (options.accept) {
    input.accept = options.accept;
  }
  if (options.multiple) {
    input.multiple = options.multiple;
  }
  if (options.capture) {
    input.capture = options.capture;
  }
  if (options.directory) {
    input.webkitdirectory = options.directory;
  }
  input.style.display = "none";
  return input;
}
function useFileDialog(input = {}) {
  const options = { ...defaultOptions, ...input };
  const [files, setFiles] = (0, import_react69.useState)(getInitialFilesList(options.initialFiles));
  const inputRef = (0, import_react69.useRef)(null);
  const handleChange = (0, import_react69.useCallback)(
    (event) => {
      const target = event.target;
      if (target?.files) {
        setFiles(target.files);
        options.onChange?.(target.files);
      }
    },
    [options.onChange]
  );
  const createAndSetupInput = (0, import_react69.useCallback)(() => {
    inputRef.current?.remove();
    inputRef.current = createInput(options);
    if (inputRef.current) {
      inputRef.current.addEventListener("change", handleChange, { once: true });
      document.body.appendChild(inputRef.current);
    }
  }, [options, handleChange]);
  useIsomorphicEffect(() => {
    createAndSetupInput();
    return () => inputRef.current?.remove();
  }, []);
  const reset = (0, import_react69.useCallback)(() => {
    setFiles(null);
    options.onChange?.(null);
  }, [options.onChange]);
  const open = (0, import_react69.useCallback)(() => {
    if (options.resetOnOpen) {
      reset();
    }
    createAndSetupInput();
    inputRef.current?.click();
  }, [options.resetOnOpen, reset, createAndSetupInput]);
  return { files, open, reset };
}

// ../../node_modules/@mantine/hooks/esm/use-long-press/use-long-press.mjs
var import_react70 = __toESM(require_react(), 1);
function useLongPress(onLongPress, options = {}) {
  const { threshold = 400, onStart, onFinish, onCancel } = options;
  const isLongPressActive = (0, import_react70.useRef)(false);
  const isPressed = (0, import_react70.useRef)(false);
  const timeout = (0, import_react70.useRef)(-1);
  (0, import_react70.useEffect)(() => () => window.clearTimeout(timeout.current), []);
  return (0, import_react70.useMemo)(() => {
    if (typeof onLongPress !== "function") {
      return {};
    }
    const start = (event) => {
      if (!isMouseEvent(event) && !isTouchEvent(event)) {
        return;
      }
      if (onStart) {
        onStart(event);
      }
      isPressed.current = true;
      timeout.current = window.setTimeout(() => {
        onLongPress(event);
        isLongPressActive.current = true;
      }, threshold);
    };
    const cancel = (event) => {
      if (!isMouseEvent(event) && !isTouchEvent(event)) {
        return;
      }
      if (isLongPressActive.current) {
        if (onFinish) {
          onFinish(event);
        }
      } else if (isPressed.current) {
        if (onCancel) {
          onCancel(event);
        }
      }
      isLongPressActive.current = false;
      isPressed.current = false;
      if (timeout.current) {
        window.clearTimeout(timeout.current);
      }
    };
    return {
      onMouseDown: start,
      onMouseUp: cancel,
      onMouseLeave: cancel,
      onTouchStart: start,
      onTouchEnd: cancel
    };
  }, [onLongPress, threshold, onCancel, onFinish, onStart]);
}
function isTouchEvent(event) {
  return window.TouchEvent ? event.nativeEvent instanceof TouchEvent : "touches" in event.nativeEvent;
}
function isMouseEvent(event) {
  return event.nativeEvent instanceof MouseEvent;
}

// ../../node_modules/@mantine/hooks/esm/use-selection/use-selection.mjs
var import_react71 = __toESM(require_react(), 1);
function useSelection(input) {
  const [selectionSet, setSelectionSet] = (0, import_react71.useState)(new Set(input.defaultSelection || []));
  useDidUpdate(() => {
    if (input.resetSelectionOnDataChange) {
      setSelectionSet(/* @__PURE__ */ new Set());
    }
  }, [input.data, input.resetSelectionOnDataChange]);
  const select = (0, import_react71.useCallback)((selected) => {
    setSelectionSet((state) => {
      if (!state.has(selected)) {
        const newSet = new Set(state);
        newSet.add(selected);
        return newSet;
      }
      return state;
    });
  }, []);
  const deselect = (0, import_react71.useCallback)((deselected) => {
    setSelectionSet((state) => {
      if (state.has(deselected)) {
        const newSet = new Set(state);
        newSet.delete(deselected);
        return newSet;
      }
      return state;
    });
  }, []);
  const toggle = (0, import_react71.useCallback)((toggled) => {
    setSelectionSet((state) => {
      const newSet = new Set(state);
      if (state.has(toggled)) {
        newSet.delete(toggled);
      } else {
        newSet.add(toggled);
      }
      return newSet;
    });
  }, []);
  const resetSelection = (0, import_react71.useCallback)(() => {
    setSelectionSet(/* @__PURE__ */ new Set());
  }, []);
  const setSelection = (0, import_react71.useCallback)((selection) => {
    setSelectionSet(new Set(selection));
  }, []);
  const isAllSelected = (0, import_react71.useCallback)(() => {
    if (input.data.length === 0) {
      return false;
    }
    return input.data.every((item) => selectionSet.has(item));
  }, [selectionSet, input.data]);
  const isSomeSelected = (0, import_react71.useCallback)(() => {
    return input.data.some((item) => selectionSet.has(item));
  }, [selectionSet, input.data]);
  return [
    Array.from(selectionSet),
    {
      select,
      deselect,
      toggle,
      isAllSelected,
      isSomeSelected,
      setSelection,
      resetSelection
    }
  ];
}

export {
  clamp,
  lowerFirst,
  randomId,
  range,
  shallowEqual,
  upperFirst,
  useCallbackRef,
  useDebouncedCallback,
  useClickOutside,
  useClipboard,
  useMediaQuery,
  useColorScheme,
  useCounter,
  useDebouncedState,
  useDebouncedValue,
  useIsomorphicEffect,
  useDocumentTitle,
  useDocumentVisibility,
  useDidUpdate,
  useFocusReturn,
  useFocusTrap,
  useForceUpdate,
  useId,
  useIdle,
  useInterval,
  useListState,
  useWindowEvent,
  useLocalStorage,
  readLocalStorageValue,
  useSessionStorage,
  readSessionStorageValue,
  assignRef,
  mergeRefs,
  useMergedRef,
  useMouse,
  clampUseMovePosition,
  useMove,
  useUncontrolled,
  usePagination,
  useQueue,
  usePageLeave,
  useReducedMotion,
  useScrollIntoView,
  useResizeObserver,
  useElementSize,
  useShallowEffect,
  useToggle,
  useViewportSize,
  useWindowScroll,
  useIntersection,
  useHash,
  getHotkeyHandler,
  useHotkeys,
  useFullscreen,
  useLogger,
  useHover,
  useValidatedState,
  useOs,
  useSetState,
  useInputState,
  useEventListener,
  useDisclosure,
  useFocusWithin,
  useNetwork,
  useTimeout,
  useTextSelection,
  usePrevious,
  useFavicon,
  useHeadroom,
  useEyeDropper,
  useInViewport,
  useMutationObserver,
  useMounted,
  useStateHistory,
  useMap,
  useSet,
  useThrottledCallback,
  useThrottledState,
  useThrottledValue,
  useIsFirstRender,
  useOrientation,
  useFetch,
  normalizeRadialValue,
  useRadialMove,
  useScrollSpy,
  useFileDialog,
  useLongPress,
  useSelection
};
//# sourceMappingURL=chunk-H6NSPMYC.js.map
