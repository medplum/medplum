import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  DevicePreview,
  EditorBlock,
  EditorConfiguration,
  EditorNodeId,
  EditorSection,
  EditorTheme,
  LeftPanelTab,
  NavigationConfig,
  RightPanelTab,
  ThemeColors,
} from '../types';

export interface EditorState {
  // Configuration
  config: EditorConfiguration | null;
  isDirty: boolean;

  // UI State
  currentPageId: EditorNodeId | null;
  selectedNodeId: EditorNodeId | null;
  hoveredNodeId: EditorNodeId | null;

  // Panel State
  leftPanelTab: LeftPanelTab;
  rightPanelTab: RightPanelTab;
  leftPanelWidth: number;
  rightPanelWidth: number;

  // Canvas State
  previewDevice: DevicePreview;
  canvasScale: number;
  interactMode: boolean;

  // Publish State
  isPublishing: boolean;
  lastPublishedAt: string | null;

  // Actions - Configuration
  setConfig: (config: EditorConfiguration) => void;
  setCurrentPage: (pageId: EditorNodeId) => void;

  // Actions - Selection
  selectNode: (nodeId: EditorNodeId | null) => void;
  hoverNode: (nodeId: EditorNodeId | null) => void;

  // Actions - Section CRUD
  addSection: (pageId: EditorNodeId, section: EditorSection, index?: number) => void;
  updateSection: (sectionId: EditorNodeId, updates: Partial<EditorSection>) => void;
  removeSection: (sectionId: EditorNodeId) => void;
  moveSection: (pageId: EditorNodeId, fromIndex: number, toIndex: number) => void;

  // Actions - Block CRUD
  addBlock: (sectionId: EditorNodeId, block: EditorBlock, index?: number) => void;
  updateBlock: (blockId: EditorNodeId, updates: Partial<EditorBlock>) => void;
  updateBlockProps: (blockId: EditorNodeId, propUpdates: Record<string, unknown>) => void;
  removeBlock: (blockId: EditorNodeId) => void;

  // Actions - Theme
  updateTheme: (updates: Partial<EditorTheme>) => void;
  updateThemeColors: (updates: Partial<ThemeColors>) => void;

  // Actions - Navigation
  updateNavigation: (updates: Partial<NavigationConfig>) => void;

  // Actions - Canvas
  setPreviewDevice: (device: DevicePreview) => void;
  setCanvasScale: (scale: number) => void;
  setInteractMode: (mode: boolean) => void;

  // Actions - Panels
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;

  // Actions - Publish
  setIsPublishing: (publishing: boolean) => void;
  setLastPublishedAt: (date: string | null) => void;
  markClean: () => void;
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    // Initial state
    config: null,
    isDirty: false,
    currentPageId: null,
    selectedNodeId: null,
    hoveredNodeId: null,
    leftPanelTab: 'pages',
    rightPanelTab: 'theme',
    leftPanelWidth: 300,
    rightPanelWidth: 360,
    previewDevice: 'desktop',
    canvasScale: 0.7,
    interactMode: false,
    isPublishing: false,
    lastPublishedAt: null,

    // Configuration
    setConfig: (config) =>
      set((state) => {
        state.config = config;
        state.currentPageId = config.pages[0]?.id ?? null;
        state.isDirty = false;
      }),

    setCurrentPage: (pageId) =>
      set((state) => {
        state.currentPageId = pageId;
        state.selectedNodeId = null;
        state.hoveredNodeId = null;
      }),

    // Selection
    selectNode: (nodeId) =>
      set((state) => {
        state.selectedNodeId = nodeId;
        if (nodeId) {
          state.rightPanelTab = 'properties';
        }
      }),

    hoverNode: (nodeId) =>
      set((state) => {
        state.hoveredNodeId = nodeId;
      }),

    // Section CRUD
    addSection: (pageId, section, index) =>
      set((state) => {
        if (!state.config) return;
        const page = state.config.pages.find((p) => p.id === pageId);
        if (!page) return;
        if (index !== undefined) {
          page.sections.splice(index, 0, section);
        } else {
          page.sections.push(section);
        }
        state.isDirty = true;
      }),

    updateSection: (sectionId, updates) =>
      set((state) => {
        if (!state.config) return;
        for (const page of state.config.pages) {
          const section = page.sections.find((s) => s.id === sectionId);
          if (section) {
            Object.assign(section, updates);
            state.isDirty = true;
            return;
          }
        }
      }),

    removeSection: (sectionId) =>
      set((state) => {
        if (!state.config) return;
        for (const page of state.config.pages) {
          const index = page.sections.findIndex((s) => s.id === sectionId);
          if (index !== -1) {
            page.sections.splice(index, 1);
            if (state.selectedNodeId === sectionId) {
              state.selectedNodeId = null;
            }
            state.isDirty = true;
            return;
          }
        }
      }),

    moveSection: (pageId, fromIndex, toIndex) =>
      set((state) => {
        if (!state.config) return;
        const page = state.config.pages.find((p) => p.id === pageId);
        if (!page) return;
        const [section] = page.sections.splice(fromIndex, 1);
        page.sections.splice(toIndex, 0, section);
        state.isDirty = true;
      }),

    // Block CRUD
    addBlock: (sectionId, block, index) =>
      set((state) => {
        if (!state.config) return;
        for (const page of state.config.pages) {
          const section = page.sections.find((s) => s.id === sectionId);
          if (section) {
            if (index !== undefined) {
              section.blocks.splice(index, 0, block);
            } else {
              section.blocks.push(block);
            }
            state.isDirty = true;
            return;
          }
        }
      }),

    updateBlock: (blockId, updates) =>
      set((state) => {
        if (!state.config) return;
        const block = findBlockInConfig(state.config, blockId);
        if (block) {
          Object.assign(block, updates);
          state.isDirty = true;
        }
      }),

    updateBlockProps: (blockId, propUpdates) =>
      set((state) => {
        if (!state.config) return;
        const block = findBlockInConfig(state.config, blockId);
        if (block) {
          Object.assign(block.props, propUpdates);
          state.isDirty = true;
        }
      }),

    removeBlock: (blockId) =>
      set((state) => {
        if (!state.config) return;
        for (const page of state.config.pages) {
          for (const section of page.sections) {
            const index = section.blocks.findIndex((b) => b.id === blockId);
            if (index !== -1) {
              section.blocks.splice(index, 1);
              if (state.selectedNodeId === blockId) {
                state.selectedNodeId = null;
              }
              state.isDirty = true;
              return;
            }
          }
        }
      }),

    // Theme
    updateTheme: (updates) =>
      set((state) => {
        if (!state.config) return;
        Object.assign(state.config.theme, updates);
        state.isDirty = true;
      }),

    updateThemeColors: (updates) =>
      set((state) => {
        if (!state.config) return;
        Object.assign(state.config.theme.colors, updates);
        state.isDirty = true;
      }),

    // Navigation
    updateNavigation: (updates) =>
      set((state) => {
        if (!state.config) return;
        Object.assign(state.config.navigation, updates);
        state.isDirty = true;
      }),

    // Canvas
    setPreviewDevice: (device) =>
      set((state) => {
        state.previewDevice = device;
      }),

    setCanvasScale: (scale) =>
      set((state) => {
        state.canvasScale = scale;
      }),

    setInteractMode: (mode) =>
      set((state) => {
        state.interactMode = mode;
        if (mode) {
          state.selectedNodeId = null;
          state.hoveredNodeId = null;
        }
      }),

    // Panels
    setLeftPanelTab: (tab) =>
      set((state) => {
        state.leftPanelTab = tab;
      }),

    setRightPanelTab: (tab) =>
      set((state) => {
        state.rightPanelTab = tab;
      }),

    // Publish
    setIsPublishing: (publishing) =>
      set((state) => {
        state.isPublishing = publishing;
      }),

    setLastPublishedAt: (date) =>
      set((state) => {
        state.lastPublishedAt = date;
      }),

    markClean: () =>
      set((state) => {
        state.isDirty = false;
      }),
  }))
);

function findBlockInConfig(config: EditorConfiguration, blockId: EditorNodeId): EditorBlock | null {
  for (const page of config.pages) {
    for (const section of page.sections) {
      for (const block of section.blocks) {
        if (block.id === blockId) return block;
        if (block.children) {
          const child = block.children.find((c) => c.id === blockId);
          if (child) return child;
        }
      }
    }
  }
  return null;
}
