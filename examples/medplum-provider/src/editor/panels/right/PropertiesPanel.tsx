import { Text, TextInput } from '@mantine/core';
import { IconClick } from '@tabler/icons-react';
import type { JSX } from 'react';
import { getComponent } from '../../registry/componentRegistry';
import { useSelectedNode } from '../../store/editorSelectors';
import { useEditorStore } from '../../store/editorStore';
import classes from './RightPanel.module.css';

export function PropertiesPanel(): JSX.Element {
  const selectedNode = useSelectedNode();
  const updateBlockProps = useEditorStore((s) => s.updateBlockProps);

  if (!selectedNode) {
    return (
      <div className={classes.noSelection}>
        <IconClick size={24} stroke={1.5} />
        <Text size="sm" c="dimmed">
          Click an element in the canvas or layers panel to see its properties
        </Text>
      </div>
    );
  }

  if (selectedNode.type === 'section') {
    return (
      <div className={classes.propertyGroup}>
        <div className={classes.propertyGroupTitle}>Section</div>
        <div className={classes.propertyRow}>
          <span className={classes.propertyLabel}>Name</span>
          <Text size="sm">{selectedNode.section.name}</Text>
        </div>
        <div className={classes.propertyRow}>
          <span className={classes.propertyLabel}>Type</span>
          <Text size="sm">{selectedNode.section.type}</Text>
        </div>
        <div className={classes.propertyRow}>
          <span className={classes.propertyLabel}>Blocks</span>
          <Text size="sm">{selectedNode.section.blocks.length}</Text>
        </div>
      </div>
    );
  }

  const block = selectedNode.block;
  const registration = getComponent(block.componentType);

  return (
    <div>
      <div className={classes.propertyGroup}>
        <div className={classes.propertyGroupTitle}>Block</div>
        <div className={classes.propertyRow}>
          <span className={classes.propertyLabel}>Name</span>
          <Text size="sm">{block.name}</Text>
        </div>
        <div className={classes.propertyRow}>
          <span className={classes.propertyLabel}>Component</span>
          <Text size="sm">{registration?.name ?? block.componentType}</Text>
        </div>
      </div>

      {registration?.propertySchema && registration.propertySchema.length > 0 && (
        <div className={classes.propertyGroup}>
          <div className={classes.propertyGroupTitle}>Properties</div>
          {registration.propertySchema.map((prop) => (
            <div key={prop.key} className={classes.propertyRow}>
              <span className={classes.propertyLabel}>{prop.label}</span>
              <div className={classes.propertyInput}>
                {prop.type === 'text' && (
                  <TextInput
                    size="xs"
                    value={String(block.props[prop.key] ?? prop.defaultValue ?? '')}
                    onChange={(e) => updateBlockProps(block.id, { [prop.key]: e.target.value })}
                  />
                )}
                {prop.type === 'number' && (
                  <TextInput
                    size="xs"
                    type="number"
                    value={String(block.props[prop.key] ?? prop.defaultValue ?? '')}
                    onChange={(e) => updateBlockProps(block.id, { [prop.key]: Number(e.target.value) })}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
