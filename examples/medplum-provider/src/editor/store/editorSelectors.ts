import type { EditorBlock, EditorConfiguration, EditorNodeId, EditorPage, EditorSection } from '../types';
import { useEditorStore } from './editorStore';

export interface FoundSection {
  type: 'section';
  page: EditorPage;
  section: EditorSection;
  index: number;
}

export interface FoundBlock {
  type: 'block';
  page: EditorPage;
  section: EditorSection;
  block: EditorBlock;
  index: number;
}

export type FoundNode = FoundSection | FoundBlock;

export function findSection(config: EditorConfiguration, sectionId: EditorNodeId): FoundSection | null {
  for (const page of config.pages) {
    const index = page.sections.findIndex((s) => s.id === sectionId);
    if (index !== -1) {
      return { type: 'section', page, section: page.sections[index], index };
    }
  }
  return null;
}

export function findBlock(config: EditorConfiguration, blockId: EditorNodeId): FoundBlock | null {
  for (const page of config.pages) {
    for (const section of page.sections) {
      const index = section.blocks.findIndex((b) => b.id === blockId);
      if (index !== -1) {
        return { type: 'block', page, section, block: section.blocks[index], index };
      }
      for (const block of section.blocks) {
        if (block.children) {
          const childIndex = block.children.findIndex((b) => b.id === blockId);
          if (childIndex !== -1) {
            return { type: 'block', page, section, block: block.children[childIndex], index: childIndex };
          }
        }
      }
    }
  }
  return null;
}

export function useCurrentPage(): EditorPage | null {
  return useEditorStore((state) => {
    if (!state.config || !state.currentPageId) return null;
    return state.config.pages.find((p) => p.id === state.currentPageId) ?? null;
  });
}

export function useSelectedNode(): FoundNode | null {
  return useEditorStore((state) => {
    if (!state.config || !state.selectedNodeId) return null;
    const section = findSection(state.config, state.selectedNodeId);
    if (section) return section;
    const block = findBlock(state.config, state.selectedNodeId);
    if (block) return block;
    return null;
  });
}
