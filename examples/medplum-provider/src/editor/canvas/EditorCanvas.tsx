import type { JSX } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useCurrentPage } from '../store/editorSelectors';
import { EditorThemeProvider } from '../theme/ThemeProvider';
import { PreviewRenderer } from './PreviewRenderer';
import classes from './EditorCanvas.module.css';

const DEVICE_WIDTHS: Record<string, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

export function EditorCanvas(): JSX.Element {
  const scale = useEditorStore((s) => s.canvasScale);
  const device = useEditorStore((s) => s.previewDevice);
  const theme = useEditorStore((s) => s.config?.theme);
  const selectNode = useEditorStore((s) => s.selectNode);
  const currentPage = useCurrentPage();

  const viewportWidth = DEVICE_WIDTHS[device] ?? 1280;

  return (
    <div className={classes.canvasContainer} onClick={() => selectNode(null)}>
      <div
        className={classes.viewport}
        style={{
          width: viewportWidth,
          transform: `scale(${scale})`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {theme && currentPage ? (
          <EditorThemeProvider theme={theme}>
            <PreviewRenderer page={currentPage} />
          </EditorThemeProvider>
        ) : (
          <div className={classes.emptyState}>
            <span>No page selected</span>
          </div>
        )}
      </div>
    </div>
  );
}
