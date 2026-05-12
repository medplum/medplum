import type { JSX } from 'react';
import type { EditorBlock, EditorPage, EditorSection } from '../types';
import { getComponent } from '../registry/componentRegistry';
import { BlockWrapper } from './BlockWrapper';
import { SectionWrapper } from './SectionWrapper';
import classes from './EditorCanvas.module.css';

interface PreviewRendererProps {
  page: EditorPage;
}

/**
 * Renders an EditorPage into a React component tree.
 * Each section is wrapped in a SectionWrapper (for selection/hover),
 * and each block is wrapped in a BlockWrapper.
 */
export function PreviewRenderer({ page }: PreviewRendererProps): JSX.Element {
  const isSidebarContent = page.settings.layout === 'sidebar-content';

  if (isSidebarContent) {
    const sidebar = page.sections.find((s) => s.type === 'sidebar');
    const contentSections = page.sections.filter((s) => s.type !== 'sidebar');

    return (
      <div className={classes.sidebarContentLayout}>
        {sidebar && (
          <SectionWrapper
            section={sidebar}
            style={{
              width: sidebar.settings.width ?? 350,
              minWidth: sidebar.settings.minWidth ?? 280,
              flexShrink: 0,
              borderRight: '1px solid #e9ecef',
              overflow: sidebar.settings.overflow ?? 'auto',
            }}
          >
            <RenderBlocks blocks={sidebar.blocks} />
          </SectionWrapper>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {contentSections.map((section) => (
            <SectionWrapper
              key={section.id}
              section={section}
              style={getSectionStyle(section)}
            >
              <RenderBlocks blocks={section.blocks} />
            </SectionWrapper>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={classes.pageLayout}>
      {page.sections.map((section) => (
        <SectionWrapper
          key={section.id}
          section={section}
          style={getSectionStyle(section)}
        >
          <RenderBlocks blocks={section.blocks} />
        </SectionWrapper>
      ))}
      {page.sections.length === 0 && (
        <div className={classes.emptyState}>
          <span>No sections yet</span>
          <span style={{ fontSize: 12 }}>Add sections from the Components tab</span>
        </div>
      )}
    </div>
  );
}

function RenderBlocks({ blocks }: { blocks: EditorBlock[] }): JSX.Element {
  return (
    <>
      {blocks.map((block) => {
        if (block.visible === false) return null;

        const registration = getComponent(block.componentType);
        const Component = registration?.component;

        return (
          <BlockWrapper key={block.id} block={block}>
            {Component ? (
              <Component {...block.props} label={block.name} />
            ) : (
              <div
                style={{
                  padding: 16,
                  background: '#fff3bf',
                  border: '1px dashed #fab005',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#e67700',
                }}
              >
                Unknown component: {block.componentType}
              </div>
            )}
          </BlockWrapper>
        );
      })}
    </>
  );
}

function getSectionStyle(section: EditorSection): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: section.settings.direction === 'horizontal' ? 'row' : 'column',
    gap: section.settings.gap,
    padding: section.settings.padding,
    backgroundColor: section.settings.backgroundColor,
    flex: section.type === 'content' ? 1 : undefined,
    overflow: section.settings.overflow,
    minHeight: 60,
  };
}
