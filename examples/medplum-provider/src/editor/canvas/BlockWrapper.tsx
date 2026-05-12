import type { JSX, ReactNode } from 'react';
import type { EditorBlock } from '../types';
import { useEditorStore } from '../store/editorStore';
import classes from './EditorCanvas.module.css';

interface BlockWrapperProps {
  block: EditorBlock;
  children: ReactNode;
}

export function BlockWrapper({ block, children }: BlockWrapperProps): JSX.Element {
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const hoveredId = useEditorStore((s) => s.hoveredNodeId);
  const selectNode = useEditorStore((s) => s.selectNode);
  const hoverNode = useEditorStore((s) => s.hoverNode);
  const interactMode = useEditorStore((s) => s.interactMode);

  const isSelected = selectedId === block.id;
  const isHovered = hoveredId === block.id && !isSelected;

  if (interactMode) {
    return <>{children}</>;
  }

  return (
    <div
      className={classes.blockWrapper}
      data-selected={isSelected || undefined}
      data-hovered={isHovered || undefined}
      onClick={(e) => {
        e.stopPropagation();
        selectNode(block.id);
      }}
      onMouseEnter={() => hoverNode(block.id)}
      onMouseLeave={() => hoverNode(null)}
    >
      <div className={classes.blockLabel}>{block.name}</div>
      <div className={classes.blockContent} data-interact={interactMode || undefined}>
        {children}
      </div>
    </div>
  );
}
