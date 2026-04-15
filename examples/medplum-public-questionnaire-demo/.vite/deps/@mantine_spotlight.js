import {
  createStore,
  useStore
} from "./chunk-ZNRVVZUU.js";
import {
  Box,
  Highlight,
  Input,
  Modal,
  ScrollArea,
  UnstyledButton,
  createSafeContext,
  factory,
  getDefaultZIndex,
  rem,
  resolveClassNames,
  resolveStyles,
  useMantineTheme,
  useProps,
  useStyles
} from "./chunk-CXUBRP74.js";
import {
  require_jsx_runtime
} from "./chunk-65KF4MGR.js";
import "./chunk-OY75SG2G.js";
import {
  clamp,
  useDidUpdate,
  useHotkeys,
  useUncontrolled
} from "./chunk-H6NSPMYC.js";
import {
  __toESM,
  require_react
} from "./chunk-IIBV4UV7.js";

// ../../node_modules/@mantine/spotlight/esm/spotlight.store.mjs
var createSpotlightStore = () => createStore({
  opened: false,
  empty: false,
  selected: -1,
  listId: "",
  query: "",
  registeredActions: /* @__PURE__ */ new Set()
});
var useSpotlight = (store) => useStore(store);
function updateSpotlightStateAction(update, store) {
  const state = store.getState();
  store.setState({ ...state, ...update(store.getState()) });
}
function openSpotlightAction(store) {
  updateSpotlightStateAction(() => ({ opened: true, selected: -1 }), store);
}
function closeSpotlightAction(store) {
  updateSpotlightStateAction(() => ({ opened: false }), store);
}
function toggleSpotlightAction(store) {
  updateSpotlightStateAction(
    (state) => ({ opened: !state.opened, selected: state.opened ? state.selected : -1 }),
    store
  );
}
function setSelectedAction(index, store) {
  store.updateState((state) => ({ ...state, selected: index }));
}
function setListId(id, store) {
  store.updateState((state) => ({ ...state, listId: id }));
}
function findElementByQuerySelector(selector, root = document) {
  const element = root.querySelector(selector);
  if (element) {
    return element;
  }
  const children = root instanceof ShadowRoot ? root.host.children : root.children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child.shadowRoot) {
      const shadowElement = findElementByQuerySelector(selector, child.shadowRoot);
      if (shadowElement) {
        return shadowElement;
      }
    }
    const nestedElement = findElementByQuerySelector(selector, child);
    if (nestedElement) {
      return nestedElement;
    }
  }
  return null;
}
function selectAction(index, store) {
  const state = store.getState();
  const actionsList = state.listId ? findElementByQuerySelector(`#${state.listId}`) : null;
  const selected = actionsList?.querySelector("[data-selected]");
  const actions = actionsList?.querySelectorAll("[data-action]") ?? [];
  const nextIndex = index === -1 ? actions.length - 1 : index === actions.length ? 0 : index;
  const selectedIndex = clamp(nextIndex, 0, actions.length - 1);
  selected?.removeAttribute("data-selected");
  actions[selectedIndex]?.scrollIntoView({ block: "nearest" });
  actions[selectedIndex]?.setAttribute("data-selected", "true");
  setSelectedAction(selectedIndex, store);
  return selectedIndex;
}
function selectNextAction(store) {
  return selectAction(store.getState().selected + 1, store);
}
function selectPreviousAction(store) {
  return selectAction(store.getState().selected - 1, store);
}
function triggerSelectedAction(store) {
  const state = store.getState();
  const selected = findElementByQuerySelector(
    `#${state.listId} [data-selected]`
  );
  selected?.click();
}
function registerAction(id, store) {
  const state = store.getState();
  state.registeredActions.add(id);
  return () => {
    state.registeredActions.delete(id);
  };
}
function setQuery(query, store) {
  updateSpotlightStateAction(() => ({ query }), store);
  Promise.resolve().then(() => {
    selectAction(0, store);
    updateSpotlightStateAction(
      (state) => ({
        empty: state.query.trim().length > 0 && state.registeredActions.size === 0 || false
      }),
      store
    );
  });
}
function clearSpotlightState({ clearQuery }, store) {
  store.updateState((state) => ({
    ...state,
    selected: -1,
    query: clearQuery ? "" : state.query,
    empty: clearQuery ? false : state.empty
  }));
}
var spotlightActions = {
  open: openSpotlightAction,
  close: closeSpotlightAction,
  toggle: toggleSpotlightAction,
  updateState: updateSpotlightStateAction,
  setSelectedAction,
  setListId,
  selectAction,
  selectNextAction,
  selectPreviousAction,
  triggerSelectedAction,
  registerAction,
  setQuery,
  clearSpotlightState
};
function createSpotlight() {
  const store = createSpotlightStore();
  const actions = {
    open: () => openSpotlightAction(store),
    close: () => closeSpotlightAction(store),
    toggle: () => toggleSpotlightAction(store)
  };
  return [store, actions];
}
var [spotlightStore, spotlight] = createSpotlight();
var { open: openSpotlight, close: closeSpotlight, toggle: toggleSpotlight } = spotlight;

// ../../node_modules/@mantine/spotlight/esm/is-actions-group.mjs
function isActionsGroup(item) {
  const _item = item;
  return _item.group !== void 0 && Array.isArray(_item.actions);
}

// ../../node_modules/@mantine/spotlight/esm/Spotlight.mjs
var import_jsx_runtime8 = __toESM(require_jsx_runtime(), 1);

// ../../node_modules/@mantine/spotlight/esm/default-spotlight-filter.mjs
function getKeywords(keywords) {
  if (Array.isArray(keywords)) {
    return keywords.map((keyword) => keyword.trim()).join(",").toLowerCase().trim();
  }
  if (typeof keywords === "string") {
    return keywords.toLowerCase().trim();
  }
  return "";
}
function getFlatActions(data) {
  return data.reduce((acc, item) => {
    if ("actions" in item) {
      return [...acc, ...item.actions.map((action) => ({ ...action, group: item.group }))];
    }
    return [...acc, item];
  }, []);
}
function flatActionsToGroups(data) {
  const groups = {};
  const result = [];
  data.forEach((action) => {
    if (action.group) {
      if (!groups[action.group]) {
        groups[action.group] = { pushed: false, data: { group: action.group, actions: [] } };
      }
      groups[action.group].data.actions.push(action);
      if (!groups[action.group].pushed) {
        groups[action.group].pushed = true;
        result.push(groups[action.group].data);
      }
    } else {
      result.push(action);
    }
  });
  return result;
}
var defaultSpotlightFilter = (_query, data) => {
  const query = _query.trim().toLowerCase();
  const priorityMatrix = [[], []];
  const flatActions = getFlatActions(data);
  flatActions.forEach((item) => {
    if (item.label?.toLowerCase().includes(query)) {
      priorityMatrix[0].push(item);
    } else if (item.description?.toLowerCase().includes(query) || getKeywords(item.keywords).includes(query)) {
      priorityMatrix[1].push(item);
    }
  });
  return flatActionsToGroups(priorityMatrix.flat());
};

// ../../node_modules/@mantine/spotlight/esm/limit-actions.mjs
function limitActions(actions, limit) {
  if (!Array.isArray(actions)) {
    return [];
  }
  let count = 0;
  return actions.reduce((acc, item) => {
    if (count >= limit) {
      return acc;
    }
    if (isActionsGroup(item)) {
      const groupActions = limitActions(item.actions, limit - count);
      acc.push({
        group: item.group,
        actions: groupActions
      });
      count += groupActions.length;
    } else {
      acc.push(item);
      count += 1;
    }
    return acc;
  }, []);
}

// ../../node_modules/@mantine/spotlight/esm/Spotlight.module.css.mjs
var classes = { "root": "m_d2b315db", "content": "m_3cd250e0", "body": "m_d2abce9b", "search": "m_f366a061", "actionsList": "m_6e463822", "action": "m_d49bb8ef", "actionBody": "m_3d475731", "actionSection": "m_832642f6", "actionLabel": "m_6c2a1345", "actionDescription": "m_a6d9d78d", "empty": "m_82f78f74", "footer": "m_ddcaf054", "actionsGroup": "m_5a3e5f7b" };

// ../../node_modules/@mantine/spotlight/esm/SpotlightAction.mjs
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);

// ../../node_modules/@mantine/spotlight/esm/Spotlight.context.mjs
var [SpotlightProvider, useSpotlightContext] = createSafeContext(
  "Spotlight component was not found in tree"
);

// ../../node_modules/@mantine/spotlight/esm/SpotlightAction.mjs
var defaultProps = {
  dimmedSections: true,
  highlightQuery: false
};
var SpotlightAction = factory((_props, ref) => {
  const props = useProps("SpotlightAction", defaultProps, _props);
  const {
    className,
    style,
    classNames,
    styles,
    id,
    description,
    label,
    leftSection,
    rightSection,
    children,
    dimmedSections,
    highlightQuery,
    highlightColor,
    closeSpotlightOnTrigger,
    onClick,
    onMouseDown,
    keywords,
    vars,
    ...others
  } = props;
  const ctx = useSpotlightContext();
  const stylesApi = { classNames, styles };
  const labelNode = highlightQuery && typeof label === "string" ? (0, import_jsx_runtime.jsx)(
    Highlight,
    {
      component: "span",
      highlight: ctx.query,
      color: highlightColor,
      ...ctx.getStyles("actionLabel", stylesApi),
      children: label
    }
  ) : (0, import_jsx_runtime.jsx)("span", { ...ctx.getStyles("actionLabel", stylesApi), children: label });
  return (0, import_jsx_runtime.jsx)(
    UnstyledButton,
    {
      ref,
      "data-action": true,
      ...ctx.getStyles("action", { className, style, ...stylesApi }),
      ...others,
      onMouseDown: (event) => {
        event.preventDefault();
        onMouseDown?.(event);
      },
      onClick: (event) => {
        onClick?.(event);
        if (closeSpotlightOnTrigger ?? ctx.closeOnActionTrigger) {
          spotlightActions.close(ctx.store);
        }
      },
      tabIndex: -1,
      children: children || (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        leftSection && (0, import_jsx_runtime.jsx)(
          Box,
          {
            component: "span",
            mod: { position: "left", dimmed: dimmedSections },
            ...ctx.getStyles("actionSection", stylesApi),
            children: leftSection
          }
        ),
        (0, import_jsx_runtime.jsxs)("span", { ...ctx.getStyles("actionBody", stylesApi), children: [
          labelNode,
          (0, import_jsx_runtime.jsx)("span", { ...ctx.getStyles("actionDescription", stylesApi), children: description })
        ] }),
        rightSection && (0, import_jsx_runtime.jsx)(
          Box,
          {
            component: "span",
            mod: { position: "right", dimmed: dimmedSections },
            ...ctx.getStyles("actionSection", stylesApi),
            children: rightSection
          }
        )
      ] })
    }
  );
});
SpotlightAction.classes = classes;
SpotlightAction.displayName = "@mantine/spotlight/SpotlightAction";

// ../../node_modules/@mantine/spotlight/esm/SpotlightActionsGroup.mjs
var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
var SpotlightActionsGroup = factory((props, ref) => {
  const { className, style, styles, classNames, label, children, ...others } = useProps(
    "SpotlightActionsGroup",
    null,
    props
  );
  const ctx = useSpotlightContext();
  return (0, import_jsx_runtime2.jsx)(
    Box,
    {
      ...ctx.getStyles("actionsGroup", { className, style, classNames, styles }),
      ref,
      ...others,
      __vars: {
        "--spotlight-label": `'${label?.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
      },
      children
    }
  );
});
SpotlightActionsGroup.classes = classes;
SpotlightActionsGroup.displayName = "@mantine/core/SpotlightActionsGroup";

// ../../node_modules/@mantine/spotlight/esm/SpotlightActionsList.mjs
var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
var import_react = __toESM(require_react(), 1);
var SpotlightActionsList = factory((props, ref) => {
  const { className, style, id, children, vars, classNames, styles, ...others } = useProps(
    "SpotlightActionsList",
    null,
    props
  );
  const ctx = useSpotlightContext();
  const generatedId = `mantine-${(0, import_react.useId)().replace(/:/g, "")}`;
  const listId = id || generatedId;
  (0, import_react.useEffect)(() => {
    spotlightActions.setListId(listId, ctx.store);
    return () => spotlightActions.setListId("", ctx.store);
  }, []);
  return (0, import_jsx_runtime3.jsx)(
    ScrollArea.Autosize,
    {
      ...ctx.getStyles("actionsList", { className, style, classNames, styles }),
      ref,
      type: "scroll",
      scrollbarSize: "var(--spotlight-actions-list-padding)",
      offsetScrollbars: "y",
      id: listId,
      ...others,
      children
    }
  );
});
SpotlightActionsList.classes = classes;
SpotlightActionsList.displayName = "@mantine/spotlight/SpotlightActionsList";

// ../../node_modules/@mantine/spotlight/esm/SpotlightEmpty.mjs
var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
var SpotlightEmpty = factory((props, ref) => {
  const { className, style, classNames, styles, ...others } = useProps(
    "SpotlightEmpty",
    null,
    props
  );
  const ctx = useSpotlightContext();
  return (0, import_jsx_runtime4.jsx)(
    Box,
    {
      ref,
      ...ctx.getStyles("empty", { classNames, styles, className, style }),
      ...others
    }
  );
});
SpotlightEmpty.classes = classes;
SpotlightEmpty.displayName = "@mantine/spotlight/SpotlightEmpty";

// ../../node_modules/@mantine/spotlight/esm/SpotlightFooter.mjs
var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
var SpotlightFooter = factory((props, ref) => {
  const { className, style, classNames, styles, ...others } = useProps(
    "SpotlightFooter",
    null,
    props
  );
  const ctx = useSpotlightContext();
  return (0, import_jsx_runtime5.jsx)(
    Box,
    {
      ref,
      ...ctx.getStyles("footer", { className, classNames, style, styles }),
      ...others
    }
  );
});
SpotlightFooter.classes = classes;
SpotlightFooter.displayName = "@mantine/spotlight/SpotlightFooter";

// ../../node_modules/@mantine/spotlight/esm/SpotlightRoot.mjs
var import_jsx_runtime6 = __toESM(require_jsx_runtime(), 1);

// ../../node_modules/@mantine/spotlight/esm/get-hotkeys.mjs
function getHotkeys(hotkeys, store) {
  if (!hotkeys) {
    return [];
  }
  const open = () => spotlightActions.open(store);
  if (Array.isArray(hotkeys)) {
    return hotkeys.map((hotkey) => [hotkey, open]);
  }
  return [[hotkeys, open]];
}

// ../../node_modules/@mantine/spotlight/esm/SpotlightRoot.mjs
var defaultProps2 = {
  size: 600,
  yOffset: 80,
  zIndex: getDefaultZIndex("max"),
  overlayProps: { backgroundOpacity: 0.35, blur: 7 },
  transitionProps: { duration: 200, transition: "pop" },
  store: spotlightStore,
  clearQueryOnClose: true,
  closeOnActionTrigger: true,
  shortcut: "mod + K",
  maxHeight: 400
};
var SpotlightRoot = factory((_props, ref) => {
  const props = useProps("SpotlightRoot", defaultProps2, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    store,
    children,
    query,
    onQueryChange,
    transitionProps,
    clearQueryOnClose,
    shortcut,
    tagsToIgnore,
    triggerOnContentEditable,
    disabled,
    onSpotlightOpen,
    onSpotlightClose,
    forceOpened,
    closeOnActionTrigger,
    maxHeight,
    scrollable,
    attributes,
    ...others
  } = props;
  const theme = useMantineTheme();
  const { opened, query: storeQuery } = useSpotlight(store);
  const _query = typeof query === "string" ? query : storeQuery;
  const setQuery2 = (q) => {
    onQueryChange?.(q);
    spotlightActions.setQuery(q, store);
  };
  const getStyles = useStyles({
    name: "Spotlight",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    attributes
  });
  useHotkeys(getHotkeys(shortcut, store), tagsToIgnore, triggerOnContentEditable);
  useDidUpdate(() => {
    opened ? onSpotlightOpen?.() : onSpotlightClose?.();
  }, [opened]);
  if (disabled) {
    return null;
  }
  return (0, import_jsx_runtime6.jsx)(
    SpotlightProvider,
    {
      value: {
        getStyles,
        query: _query,
        setQuery: setQuery2,
        store,
        closeOnActionTrigger
      },
      children: (0, import_jsx_runtime6.jsx)(
        Modal,
        {
          ref,
          ...others,
          withCloseButton: false,
          opened: opened || !!forceOpened,
          padding: 0,
          onClose: () => spotlightActions.close(store),
          className,
          style,
          classNames: resolveClassNames({
            theme,
            classNames: [classes, classNames],
            props,
            stylesCtx: void 0
          }),
          styles: resolveStyles({ theme, styles, props, stylesCtx: void 0 }),
          transitionProps: {
            ...transitionProps,
            onExited: () => {
              clearQueryOnClose && setQuery2("");
              spotlightActions.clearSpotlightState({ clearQuery: clearQueryOnClose }, store);
              transitionProps?.onExited?.();
            }
          },
          __vars: { "--spotlight-max-height": scrollable ? rem(maxHeight) : void 0 },
          __staticSelector: "Spotlight",
          "data-scrollable": scrollable || void 0,
          children
        }
      )
    }
  );
});
SpotlightRoot.classes = classes;
SpotlightRoot.displayName = "@mantine/spotlight/SpotlightRoot";

// ../../node_modules/@mantine/spotlight/esm/SpotlightSearch.mjs
var import_jsx_runtime7 = __toESM(require_jsx_runtime(), 1);
var import_react2 = __toESM(require_react(), 1);
var defaultProps3 = {
  size: "lg"
};
var SpotlightSearch = factory((props, ref) => {
  const { classNames, styles, onKeyDown, onChange, vars, value, ...others } = useProps(
    "SpotlightSearch",
    defaultProps3,
    props
  );
  const ctx = useSpotlightContext();
  const inputStyles = ctx.getStyles("search");
  const [isComposing, setIsComposing] = (0, import_react2.useState)(false);
  const handleKeyDown = (event) => {
    onKeyDown?.(event);
    if (isComposing) {
      return;
    }
    if (event.nativeEvent.code === "ArrowDown") {
      event.preventDefault();
      spotlightActions.selectNextAction(ctx.store);
    }
    if (event.nativeEvent.code === "ArrowUp") {
      event.preventDefault();
      spotlightActions.selectPreviousAction(ctx.store);
    }
    if (event.nativeEvent.code === "Enter" || event.nativeEvent.code === "NumpadEnter") {
      event.preventDefault();
      spotlightActions.triggerSelectedAction(ctx.store);
    }
  };
  return (0, import_jsx_runtime7.jsx)(
    Input,
    {
      ref,
      classNames: [{ input: inputStyles.className }, classNames],
      styles: [{ input: inputStyles.style }, styles],
      ...others,
      value: value ?? ctx.query,
      onChange: (event) => {
        ctx.setQuery(event.currentTarget.value);
        onChange?.(event);
      },
      onKeyDown: handleKeyDown,
      onCompositionStart: () => setIsComposing(true),
      onCompositionEnd: () => setIsComposing(false)
    }
  );
});
SpotlightSearch.classes = classes;
SpotlightSearch.displayName = "@mantine/spotlight/SpotlightSearch";

// ../../node_modules/@mantine/spotlight/esm/Spotlight.mjs
var defaultProps4 = {
  size: 600,
  yOffset: 80,
  limit: Infinity,
  zIndex: getDefaultZIndex("max"),
  overlayProps: { backgroundOpacity: 0.35, blur: 7 },
  transitionProps: { duration: 200, transition: "pop" },
  store: spotlightStore,
  filter: defaultSpotlightFilter,
  clearQueryOnClose: true,
  closeOnActionTrigger: true,
  shortcut: "mod + K"
};
var Spotlight = factory((_props, ref) => {
  const props = useProps("Spotlight", defaultProps4, _props);
  const {
    searchProps,
    filter,
    query,
    onQueryChange,
    actions,
    nothingFound,
    highlightQuery,
    limit,
    scrollAreaProps,
    ...others
  } = props;
  const [_query, setQuery2] = useUncontrolled({
    value: query,
    defaultValue: "",
    finalValue: "",
    onChange: onQueryChange
  });
  const filteredActions = limitActions(filter(_query, actions), limit).map((item) => {
    if (isActionsGroup(item)) {
      const items = item.actions.map(({ id, ...actionData }) => (0, import_jsx_runtime8.jsx)(SpotlightAction, { highlightQuery, ...actionData }, id));
      return (0, import_jsx_runtime8.jsx)(SpotlightActionsGroup, { label: item.group, children: items }, item.group);
    }
    return (0, import_jsx_runtime8.jsx)(SpotlightAction, { highlightQuery, ...item }, item.id);
  });
  return (0, import_jsx_runtime8.jsxs)(SpotlightRoot, { ...others, query: _query, onQueryChange: setQuery2, ref, children: [
    (0, import_jsx_runtime8.jsx)(SpotlightSearch, { ...searchProps }),
    (0, import_jsx_runtime8.jsxs)(SpotlightActionsList, { ...scrollAreaProps, children: [
      filteredActions,
      filteredActions.length === 0 && nothingFound && (0, import_jsx_runtime8.jsx)(SpotlightEmpty, { children: nothingFound })
    ] })
  ] });
});
Spotlight.classes = classes;
Spotlight.displayName = "@mantine/spotlight/Spotlight";
Spotlight.Search = SpotlightSearch;
Spotlight.ActionsList = SpotlightActionsList;
Spotlight.Action = SpotlightAction;
Spotlight.Empty = SpotlightEmpty;
Spotlight.ActionsGroup = SpotlightActionsGroup;
Spotlight.Footer = SpotlightFooter;
Spotlight.Root = SpotlightRoot;
Spotlight.open = spotlight.open;
Spotlight.close = spotlight.close;
Spotlight.toggle = spotlight.toggle;
export {
  Spotlight,
  SpotlightAction,
  SpotlightActionsGroup,
  SpotlightActionsList,
  SpotlightEmpty,
  SpotlightFooter,
  SpotlightRoot,
  SpotlightSearch,
  closeSpotlight,
  createSpotlight,
  createSpotlightStore,
  isActionsGroup,
  openSpotlight,
  spotlight,
  toggleSpotlight,
  useSpotlight
};
//# sourceMappingURL=@mantine_spotlight.js.map
