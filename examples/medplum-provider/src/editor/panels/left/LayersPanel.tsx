import { IconBox, IconColumns, IconEye, IconEyeOff, IconLayoutSidebar, IconStack2 } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { EditorBlock, EditorSection, SectionType } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import { useCurrentPage } from '../../store/editorSelectors';
import classes from './LeftPanel.module.css';

const SECTION_ICONS: Record<SectionType, JSX.Element> = {
  sidebar: <IconLayoutSidebar size={14} />,
  content: <IconStack2 size={14} />,
  tabs: <IconColumns size={14} />,
  header: <IconStack2 size={14} />,
  split: <IconColumns size={14} />,
  stack: <IconStack2 size={14} />,
  custom: <IconBox size={14} />,
};

export function LayersPanel(): JSX.Element {
  const currentPage = useCurrentPage();
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const hoveredNodeId = useEditorStore((s) => s.hoveredNodeId);
  const selectNode = useEditorStore((s) => s.selectNode);
  const hoverNode = useEditorStore((s) => s.hoverNode);
  const updateBlock = useEditorStore((s) => s.updateBlock);

  if (!currentPage) {
    return <div style={{ padding: 16, color: '#868e96' }}>Select a page</div>;
  }

  function toggleBlockVisibility(block: EditorBlock): void {
    updateBlock(block.id, { visible: block.visible === false ? true : false });
  }

  return (
    <div>
      <div className={classes.sectionHeader}>{currentPage.name}</div>
      {currentPage.sections.map((section) => (
        <div key={section.id}>
          <SectionLayer
            section={section}
            isSelected={selectedNodeId === section.id}
            isHovered={hoveredNodeId === section.id}
            onSelect={() => selectNode(section.id)}
            onHover={(hover) => hoverNode(hover ? section.id : null)}
          />
          {section.blocks.map((block) => (
            <BlockLayer
              key={block.id}
              block={block}
              isSelected={selectedNodeId === block.id}
              isHovered={hoveredNodeId === block.id}
              onSelect={() => selectNode(block.id)}
              onHover={(hover) => hoverNode(hover ? block.id : null)}
              onToggleVisibility={() => toggleBlockVisibility(block)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SectionLayerProps {
  section: EditorSection;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
}

function SectionLayer({ section, isSelected, isHovered, onSelect, onHover }: SectionLayerProps): JSX.Element {
  return (
    <div
      className={classes.layerItem}
      data-active={isSelected || undefined}
      data-hovered={isHovered || undefined}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ fontWeight: 500 }}
    >
      <span className={classes.layerIcon}>{SECTION_ICONS[section.type]}</span>
      <span className={classes.layerName}>{section.name}</span>
    </div>
  );
}

interface BlockLayerProps {
  block: EditorBlock;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
  onToggleVisibility: () => void;
}

function BlockLayer({
  block,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onToggleVisibility,
}: BlockLayerProps): JSX.Element {
  const isHidden = block.visible === false;

  return (
    <div
      className={classes.layerItem}
      data-active={isSelected || undefined}
      data-hovered={isHovered || undefined}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ opacity: isHidden ? 0.5 : 1 }}
    >
      <span className={classes.layerIndent} />
      <span className={classes.layerIcon}>
        <IconBox size={14} />
      </span>
      <span className={classes.layerName}>{block.name}</span>
      <span
        className={classes.visibilityToggle}
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
      >
        {isHidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </span>
    </div>
  );
}
