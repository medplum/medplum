import { NumberInput, Select, Switch } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { ThemeColors } from '../../types';
import { useEditorStore } from '../../store/editorStore';
import classes from './RightPanel.module.css';

type ColorKey = keyof ThemeColors;

const COLOR_FIELDS: { key: ColorKey; label: string; description?: string }[] = [
  { key: 'primary', label: 'Primary', description: 'Main brand color' },
  { key: 'accent1', label: 'Accent 1', description: 'Solid button background' },
  { key: 'accent2', label: 'Accent 2', description: 'Secondary accent' },
  { key: 'textPrimary', label: 'Text', description: 'Primary foreground on backgrounds' },
  { key: 'textSecondary', label: 'Text Secondary' },
  { key: 'background1', label: 'Background 1', description: 'Main background' },
  { key: 'background2', label: 'Background 2', description: 'Card/surface' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'error', label: 'Error' },
];

export function ThemeSettingsPanel(): JSX.Element {
  return (
    <div>
      <ColorsSection />
      <TypographySection />
      <LayoutSection />
      <ButtonsSection />
      <InputsSection />
      <CardsSection />
    </div>
  );
}

function ColorsSection(): JSX.Element {
  const [open, setOpen] = useState(true);
  const theme = useEditorStore((s) => s.config?.theme);
  const updateThemeColors = useEditorStore((s) => s.updateThemeColors);

  if (!theme) return <></>;

  return (
    <div className={classes.themeSection}>
      <div className={classes.themeSectionHeader} onClick={() => setOpen(!open)}>
        <span>Colors</span>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
      </div>
      {open && (
        <div className={classes.themeSectionBody}>
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key} className={classes.colorRow}>
              <span className={classes.colorLabel}>{label}</span>
              <div className={classes.colorSwatch} style={{ backgroundColor: theme.colors[key] }}>
                <input
                  type="color"
                  className={classes.colorInput}
                  value={theme.colors[key]}
                  onChange={(e) => updateThemeColors({ [key]: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TypographySection(): JSX.Element {
  const [open, setOpen] = useState(false);
  const theme = useEditorStore((s) => s.config?.theme);
  const updateTheme = useEditorStore((s) => s.updateTheme);

  if (!theme) return <></>;

  return (
    <div className={classes.themeSection}>
      <div className={classes.themeSectionHeader} onClick={() => setOpen(!open)}>
        <span>Typography</span>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
      </div>
      {open && (
        <div className={classes.themeSectionBody}>
          <Select
            label="Font Family"
            size="xs"
            value={theme.typography.fontFamily.includes('system-ui') ? 'system' : 'custom'}
            data={[
              { value: 'system', label: 'System Default' },
              { value: 'inter', label: 'Inter' },
              { value: 'roboto', label: 'Roboto' },
            ]}
            onChange={(val) => {
              const fonts: Record<string, string> = {
                system:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                inter: '"Inter", -apple-system, sans-serif',
                roboto: '"Roboto", -apple-system, sans-serif',
              };
              updateTheme({
                typography: { ...theme.typography, fontFamily: fonts[val ?? 'system'] ?? fonts.system },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function LayoutSection(): JSX.Element {
  const [open, setOpen] = useState(false);
  const theme = useEditorStore((s) => s.config?.theme);
  const updateTheme = useEditorStore((s) => s.updateTheme);

  if (!theme) return <></>;

  return (
    <div className={classes.themeSection}>
      <div className={classes.themeSectionHeader} onClick={() => setOpen(!open)}>
        <span>Layout</span>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
      </div>
      {open && (
        <div className={classes.themeSectionBody}>
          <NumberInput
            label="Page max width"
            size="xs"
            value={theme.layout.pageMaxWidth}
            suffix=" px"
            min={800}
            max={2400}
            step={100}
            onChange={(val) =>
              updateTheme({
                layout: { ...theme.layout, pageMaxWidth: Number(val) || 1200 },
              })
            }
            mb="sm"
          />
          <NumberInput
            label="Content padding"
            size="xs"
            value={theme.layout.contentPadding}
            suffix=" px"
            min={0}
            max={64}
            step={4}
            onChange={(val) =>
              updateTheme({
                layout: { ...theme.layout, contentPadding: Number(val) || 24 },
              })
            }
            mb="sm"
          />
          <NumberInput
            label="Sidebar width"
            size="xs"
            value={theme.layout.sidebarWidth}
            suffix=" px"
            min={200}
            max={500}
            step={10}
            onChange={(val) =>
              updateTheme({
                layout: { ...theme.layout, sidebarWidth: Number(val) || 350 },
              })
            }
            mb="sm"
          />
          <Select
            label="Border radius"
            size="xs"
            value={theme.layout.borderRadius}
            data={[
              { value: 'xs', label: 'Extra Small' },
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
              { value: 'xl', label: 'Extra Large' },
            ]}
            onChange={(val) =>
              updateTheme({
                layout: {
                  ...theme.layout,
                  borderRadius: (val as 'xs' | 'sm' | 'md' | 'lg' | 'xl') ?? 'sm',
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ButtonsSection(): JSX.Element {
  const [open, setOpen] = useState(false);
  const theme = useEditorStore((s) => s.config?.theme);
  const updateTheme = useEditorStore((s) => s.updateTheme);

  if (!theme) return <></>;

  return (
    <div className={classes.themeSection}>
      <div className={classes.themeSectionHeader} onClick={() => setOpen(!open)}>
        <span>Buttons</span>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
      </div>
      {open && (
        <div className={classes.themeSectionBody}>
          <Select
            label="Default variant"
            size="xs"
            value={theme.components.buttons.defaultVariant}
            data={[
              { value: 'filled', label: 'Filled' },
              { value: 'outline', label: 'Outline' },
              { value: 'light', label: 'Light' },
              { value: 'subtle', label: 'Subtle' },
            ]}
            onChange={(val) =>
              updateTheme({
                components: {
                  ...theme.components,
                  buttons: {
                    ...theme.components.buttons,
                    defaultVariant: (val as 'filled' | 'outline' | 'light' | 'subtle') ?? 'filled',
                  },
                },
              })
            }
            mb="sm"
          />
          <Select
            label="Border radius"
            size="xs"
            value={theme.components.buttons.borderRadius}
            data={[
              { value: 'xs', label: 'Extra Small' },
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
              { value: 'xl', label: 'Extra Large (Pill)' },
            ]}
            onChange={(val) =>
              updateTheme({
                components: {
                  ...theme.components,
                  buttons: { ...theme.components.buttons, borderRadius: val ?? 'sm' },
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function InputsSection(): JSX.Element {
  const [open, setOpen] = useState(false);
  const theme = useEditorStore((s) => s.config?.theme);
  const updateTheme = useEditorStore((s) => s.updateTheme);

  if (!theme) return <></>;

  return (
    <div className={classes.themeSection}>
      <div className={classes.themeSectionHeader} onClick={() => setOpen(!open)}>
        <span>Inputs</span>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
      </div>
      {open && (
        <div className={classes.themeSectionBody}>
          <Select
            label="Variant"
            size="xs"
            value={theme.components.inputs.variant}
            data={[
              { value: 'default', label: 'Default' },
              { value: 'filled', label: 'Filled' },
              { value: 'unstyled', label: 'Unstyled' },
            ]}
            onChange={(val) =>
              updateTheme({
                components: {
                  ...theme.components,
                  inputs: {
                    ...theme.components.inputs,
                    variant: (val as 'default' | 'filled' | 'unstyled') ?? 'default',
                  },
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function CardsSection(): JSX.Element {
  const [open, setOpen] = useState(false);
  const theme = useEditorStore((s) => s.config?.theme);
  const updateTheme = useEditorStore((s) => s.updateTheme);

  if (!theme) return <></>;

  return (
    <div className={classes.themeSection}>
      <div className={classes.themeSectionHeader} onClick={() => setOpen(!open)}>
        <span>Cards</span>
        {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
      </div>
      {open && (
        <div className={classes.themeSectionBody}>
          <Switch
            label="Show border"
            size="sm"
            checked={theme.components.cards.withBorder}
            onChange={(e) =>
              updateTheme({
                components: {
                  ...theme.components,
                  cards: { ...theme.components.cards, withBorder: e.currentTarget.checked },
                },
              })
            }
            mb="sm"
          />
          <Select
            label="Shadow"
            size="xs"
            value={theme.components.cards.shadow}
            data={[
              { value: 'none', label: 'None' },
              { value: 'xs', label: 'Extra Small' },
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
            ]}
            onChange={(val) =>
              updateTheme({
                components: {
                  ...theme.components,
                  cards: { ...theme.components.cards, shadow: val ?? 'sm' },
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
