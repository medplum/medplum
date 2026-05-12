import { Loading } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { EditorCanvas } from './canvas/EditorCanvas';
import { generateDefaultConfig } from './config/defaultConfig';
import { LeftPanel } from './panels/left/LeftPanel';
import { RightPanel } from './panels/right/RightPanel';
import { registerDefaultComponents } from './registry/registerDefaults';
import { useEditorStore } from './store/editorStore';
import { EditorToolbar } from './toolbar/EditorToolbar';
import classes from './EditorApp.module.css';

// Register all built-in components on module load
registerDefaultComponents();

export function EditorApp(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const setConfig = useEditorStore((s) => s.setConfig);

  useEffect(() => {
    // For Phase 1, always start with the default config.
    // In Phase 2+, we'll load from FHIR first.
    const config = generateDefaultConfig();
    setConfig(config);
    setLoading(false);
  }, [setConfig]);

  if (loading) {
    return <Loading />;
  }

  return (
    <div className={classes.editorRoot}>
      <EditorToolbar />
      <div className={classes.editorBody}>
        <LeftPanel />
        <EditorCanvas />
        <RightPanel />
      </div>
    </div>
  );
}
