import type { CSSProperties, JSX, ReactNode } from 'react';
import type { EditorSection } from '../types';
import { useEditorStore } from '../store/editorStore';
import classes from './EditorCanvas.module.css';

interface SectionWrapperProps {
  section: EditorSection;
  children: ReactNode;
  style?: CSSProperties;
}

export function SectionWrapper({ section, children, style }: SectionWrapperProps): JSX.Element {
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const hoveredId = useEditorStore((s) => s.hoveredNodeId);
  const selectNode = useEditorStore((s) => s.selectNode);
  const hoverNode = useEditorStore((s) => s.hoverNode);
  const interactMode = useEditorStore((s) => s.interactMode);

  const isSelected = selectedId === section.id;
  const isHovered = hoveredId === section.id && !isSelected;

  if (interactMode) {
    return <div style={style}>{children}</div>;
  }

  return (
    <div
      className={classes.sectionWrapper}
      data-selected={isSelected || undefined}
      data-hovered={isHovered || undefined}
      style={style}
      onClick={(e) => {
        // Only select section if the click target is the section itself, not a child block
        if (e.currentTarget === e.target) {
          selectNode(section.id);
        }
      }}
      onMouseEnter={() => hoverNode(section.id)}
      onMouseLeave={() => hoverNode(null)}
    >
      <div className={classes.sectionLabel}>{section.name}</div>
      {children}
    </div>
  );
}
