// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  CloseButton,
  Flex,
  Group,
  NativeSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type {
  CodeSystem,
  Coding,
  ConceptMap,
  ConceptMapGroup,
  ConceptMapGroupElement,
  ConceptMapGroupElementTarget,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import cx from 'clsx';
import type { JSX, KeyboardEvent, MouseEvent, SyntheticEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CodingInput } from '../CodingInput/CodingInput';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { ResourceInput } from '../ResourceInput/ResourceInput';
import { killEvent } from '../utils/dom';
import classes from './ConceptMapBuilder.module.css';
import { ConceptMapMappingsTable } from './ConceptMapMappingsTable';
import type { ElementFilter, Equivalence } from './utils';
import {
  COMMENT_REQUIRED,
  EDIT_LIMIT,
  EQUIVALENCE_OPTIONS,
  countElements,
  equivalenceColor,
  isNoMap,
  matchesFilter,
  matchesSearch,
} from './utils';

/**
 * Enter inside a text field must not implicitly submit the form. An accidental save on a
 * ConceptMap is expensive — it can replace `$import`-ed mappings — and Enter is the natural
 * gesture after typing a search term, so saving stays an explicit click on Save.
 * @param e - The keyboard event.
 */
function blockEnterSubmit(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key === 'Enter') {
    e.preventDefault();
  }
}

/**
 * Display-only cap: only the first RENDER_CAP filtered rows are rendered. Filtering happens
 * against the full element array; the cap never mutates `value`, so save writes every element.
 */
const RENDER_CAP = 200;

export interface ConceptMapBuilderProps {
  readonly value: Partial<ConceptMap> | Reference<ConceptMap>;
  readonly onSubmit: (result: ConceptMap) => void;
}

export function ConceptMapBuilder(props: ConceptMapBuilderProps): JSX.Element | null {
  const medplum = useMedplum();
  const defaultValue = useResource(props.value);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [hoverKey, setHoverKey] = useState<string>();
  const [value, setValue] = useState<ConceptMap>();
  const [error, setError] = useState<string>();

  function handleDocumentMouseOver(): void {
    setHoverKey(undefined);
  }

  function handleDocumentClick(): void {
    setSelectedKey(undefined);
  }

  useEffect(() => {
    medplum
      .requestSchema('ConceptMap')
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setValue(ensureConceptMapKeys(defaultValue ?? { resourceType: 'ConceptMap', status: 'draft' }));
    document.addEventListener('mouseover', handleDocumentMouseOver);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('mouseover', handleDocumentMouseOver);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [defaultValue]);

  if (!schemaLoaded || !value) {
    return null;
  }

  const totalElements = countElements(value);
  const readOnly = totalElements > EDIT_LIMIT;

  // A saved ConceptMap with no inline groups may still have mappings loaded through
  // `ConceptMap/$import`, which stores them outside the resource. This tab cannot see those, and
  // saving any inline mapping re-derives the server's mapping table from `group[]` alone — which
  // deletes them. There is no API to detect imported mappings, so gate the warning on the moment
  // it actually matters: an edit is pending on a map that arrived with no inline groups. Warning
  // on arrival instead would fire on every newly created ConceptMap, which is just noise.
  const arrivedEmpty = Boolean(defaultValue && 'id' in defaultValue && defaultValue.id && !defaultValue.group?.length);
  const mayReplaceImportedMappings = arrivedEmpty && totalElements > 0;

  function changeProperty(property: string, newValue: any): void {
    setValue((prevValue) => ({ ...prevValue, [property]: newValue }) as ConceptMap);
  }

  function handleSubmit(): void {
    const missing = findMissingEquivalence(value as ConceptMap);
    if (missing) {
      setError('Every target with a code needs a relationship. Select one before saving.');
      setSelectedKey(missing);
      return;
    }
    const missingComment = findMissingComment(value as ConceptMap);
    if (missingComment) {
      setError('Narrower and inexact mappings require a comment explaining the difference.');
      setSelectedKey(missingComment);
      return;
    }
    setError(undefined);
    props.onSubmit(pruneEmptyGroups(value as ConceptMap));
  }

  return (
    <div>
      <Form testid="conceptmap-form" onSubmit={handleSubmit}>
        {readOnly && (
          <Alert icon={<IconInfoCircle size={16} />} color="yellow" title="Map too large to edit visually" mb="md">
            This ConceptMap has {totalElements.toLocaleString()} source codes, above the {EDIT_LIMIT.toLocaleString()}
            -row visual editing limit, so it is shown as a read-only table below. Load maps of this size with the{' '}
            <Text component="span" ff="monospace">
              ConceptMap/$import
            </Text>{' '}
            operation. The JSON tab is not a workaround at this size — the server rejects request bodies over its
            configured limit (1 MB by default).
          </Alert>
        )}
        {mayReplaceImportedMappings && (
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="yellow"
            title="This map may have mappings that are not shown here"
            mb="md"
            data-testid="imported-mappings-warning"
          >
            This ConceptMap arrived with no inline mappings. If its mappings were loaded with{' '}
            <Text component="span" ff="monospace">
              ConceptMap/$import
            </Text>
            , they are stored outside the resource, cannot be shown on this tab, and saving will replace them with just
            the mappings listed here.
          </Alert>
        )}
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" mb="md" data-testid="conceptmap-error">
            {error}
          </Alert>
        )}
        {readOnly ? (
          <ConceptMapMappingsTable value={value} />
        ) : (
          <>
            <GroupArrayBuilder
              resource={value}
              groups={value.group ?? []}
              selectedKey={selectedKey}
              setSelectedKey={setSelectedKey}
              hoverKey={hoverKey}
              setHoverKey={setHoverKey}
              onChange={(x) => changeProperty('group', x)}
            />
            <SubmitButton mt="md">Save</SubmitButton>
          </>
        )}
      </Form>
    </div>
  );
}

interface GroupArrayBuilderProps {
  readonly resource: ConceptMap;
  readonly groups: ConceptMapGroup[];
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (groups: ConceptMapGroup[]) => void;
}

function GroupArrayBuilder(props: GroupArrayBuilderProps): JSX.Element {
  const { groups } = props;
  const singleGroup = groups.length === 1;

  function changeGroup(changedGroup: ConceptMapGroup): void {
    props.onChange(groups.map((g) => (g.id === changedGroup.id ? changedGroup : g)));
  }

  function addGroup(): void {
    const newGroup: ConceptMapGroup = { id: generateId(), element: [] };
    props.onChange([...groups, newGroup]);
    props.setSelectedKey(newGroup.id);
  }

  function removeGroup(removedGroup: ConceptMapGroup): void {
    props.onChange(groups.filter((g) => g !== removedGroup));
  }

  return (
    <Stack gap="md">
      {groups.map((group, index) => (
        <GroupBuilder
          key={group.id}
          resource={props.resource}
          group={group}
          groupIndex={index}
          collapsible={!singleGroup}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onChange={changeGroup}
          onRemove={() => removeGroup(group)}
        />
      ))}
      <div>
        <Button
          variant="outline"
          leftSection={<IconPlus size={16} />}
          onClick={(e: MouseEvent) => {
            killEvent(e);
            addGroup();
          }}
        >
          Group
        </Button>
      </div>
    </Stack>
  );
}

interface GroupBuilderProps {
  readonly resource: ConceptMap;
  readonly group: ConceptMapGroup;
  readonly groupIndex: number;
  readonly collapsible: boolean;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (group: ConceptMapGroup) => void;
  readonly onRemove: () => void;
}

function GroupBuilder(props: GroupBuilderProps): JSX.Element {
  const { group, resource } = props;

  // UI-only binding state. SystemInput reports the CodeSystem's `valueSet` as it resolves, either
  // from a user pick or from the canonical URL already stored on the group. An explicit
  // sourceCanonical/targetCanonical on the ConceptMap always wins.
  const [sourceBinding, setSourceBinding] = useState<string | undefined>(resource.sourceCanonical);
  const [targetBinding, setTargetBinding] = useState<string | undefined>(resource.targetCanonical);

  const handleSourceBinding = useCallback(
    (binding: string | undefined) => setSourceBinding(resource.sourceCanonical ?? binding),
    [resource.sourceCanonical]
  );

  const handleTargetBinding = useCallback(
    (binding: string | undefined) => setTargetBinding(resource.targetCanonical ?? binding),
    [resource.targetCanonical]
  );

  function changeProperty(property: keyof ConceptMapGroup, val: any): void {
    props.onChange({ ...group, [property]: val });
  }

  return (
    <Box className={classes.group} data-testid={group.id} role="group" aria-label={groupLabel(group, props.groupIndex)}>
      <Flex className={classes.header} gap="lg" align="flex-end" wrap="wrap">
        <SystemInput
          label="Source system"
          system={group.source}
          version={group.sourceVersion}
          onChangeSystem={(url, version) => props.onChange({ ...group, source: url, sourceVersion: version })}
          onBindingChange={handleSourceBinding}
        />
        <Text mb={6} c="dimmed">
          →
        </Text>
        <SystemInput
          label="Target system"
          system={group.target}
          version={group.targetVersion}
          onChangeSystem={(url, version) => props.onChange({ ...group, target: url, targetVersion: version })}
          onBindingChange={handleTargetBinding}
        />
        {props.collapsible && (
          <CloseButton
            ml="auto"
            aria-label="Remove group"
            data-testid={`remove-group-${group.id}`}
            onClick={(e) => {
              killEvent(e);
              props.onRemove();
            }}
          />
        )}
      </Flex>
      {group.unmapped && (
        <Text size="xs" c="dimmed" mb="xs" data-testid="unmapped-rule">
          Fallback rule for codes not listed below: mode={group.unmapped.mode}
          {group.unmapped.code && `, code=${group.unmapped.code}`}
          {group.unmapped.display && ` (${group.unmapped.display})`}
          {group.unmapped.url && `, fallback map=${group.unmapped.url}`} — preserved on save, editable on the JSON tab.
        </Text>
      )}
      <ElementArrayBuilder
        group={group}
        sourceBinding={sourceBinding}
        targetBinding={targetBinding}
        selectedKey={props.selectedKey}
        setSelectedKey={props.setSelectedKey}
        hoverKey={props.hoverKey}
        setHoverKey={props.setHoverKey}
        onChange={(elements) => changeProperty('element', elements)}
      />
    </Box>
  );
}

interface SystemInputProps {
  readonly label: string;
  readonly system: string | undefined;
  readonly version: string | undefined;
  readonly onChangeSystem: (url: string | undefined, version: string | undefined) => void;
  readonly onBindingChange: (binding: string | undefined) => void;
}

/**
 * Picks the code system for one side of a group.
 *
 * `group.source`/`group.target` store a canonical URL, not a reference, so on load the URL is
 * looked up to find its CodeSystem. That resolved resource does two jobs: it prefills this picker
 * so the field shows the system that is actually selected, and its `valueSet` becomes the binding
 * for the group's code pickers. When no CodeSystem resource matches the stored URL, the raw-URL
 * field takes over so the control still shows what is stored rather than looking empty.
 * @param props - The SystemInput React props.
 * @returns The SystemInput React node.
 */
function SystemInput(props: SystemInputProps): JSX.Element {
  const medplum = useMedplum();
  const { system, onBindingChange } = props;
  const [mode, setMode] = useState<'auto' | 'picker' | 'manual'>('auto');
  const [lookup, setLookup] = useState<{ url: string; codeSystem: CodeSystem | undefined }>();

  useEffect(() => {
    // Skip the lookup while the user hand-types a URL: it would fire one search per keystroke, and
    // a hand-entered system is by definition one the picker did not resolve. Reopening the map
    // resolves it normally.
    if (!system || mode === 'manual') {
      return undefined;
    }
    let active = true;
    medplum
      .searchOne('CodeSystem', { url: system })
      .then((codeSystem) => {
        if (active) {
          setLookup({ url: system, codeSystem });
          onBindingChange(codeSystem?.valueSet);
        }
      })
      .catch(console.log);
    return () => {
      active = false;
    };
  }, [medplum, system, mode, onBindingChange]);

  const resolved = lookup?.url === system;
  const codeSystem = resolved ? lookup?.codeSystem : undefined;
  // Once a stored URL is known to match no CodeSystem resource, fall back to the URL field so the
  // value stays visible and editable. An explicit user choice always overrides this.
  const manual = mode === 'manual' || (mode === 'auto' && Boolean(system) && resolved && !codeSystem);

  if (manual) {
    return (
      <Box>
        <TextInput
          label={props.label}
          placeholder="https://example.org/CodeSystem/…"
          defaultValue={system}
          onKeyDown={blockEnterSubmit}
          onChange={(e) => {
            // Typing here is an explicit choice to hand-enter the URL. Locking the mode keeps the
            // field from being swapped for the picker mid-edit if the text happens to resolve, and
            // drops the stale binding from whatever system was selected before.
            setMode('manual');
            onBindingChange(undefined);
            props.onChangeSystem(e.currentTarget.value || undefined, undefined);
          }}
        />
        {props.version && (
          <Text size="xs" c="dimmed">
            v{props.version}
          </Text>
        )}
        <Anchor size="xs" component="button" type="button" onClick={() => setMode('picker')}>
          Pick a CodeSystem instead
        </Anchor>
      </Box>
    );
  }

  return (
    <Box>
      <ResourceInput<CodeSystem>
        // Remount once the lookup lands so the resolved CodeSystem becomes the field's value —
        // ResourceInput reads defaultValue on mount only.
        key={codeSystem?.id ?? 'unresolved'}
        label={props.label}
        name={`system-${props.label}`}
        resourceType="CodeSystem"
        defaultValue={codeSystem}
        placeholder="Search for a CodeSystem"
        onChange={(picked) => {
          setLookup(picked?.url ? { url: picked.url, codeSystem: picked } : undefined);
          props.onChangeSystem(picked?.url, picked?.version);
          onBindingChange(picked?.valueSet);
        }}
      />
      {system && (
        <Text size="xs" c="dimmed">
          {system}
          {props.version && ` (v${props.version})`}
        </Text>
      )}
      <Anchor size="xs" component="button" type="button" onClick={() => setMode('manual')}>
        Enter URL manually
      </Anchor>
    </Box>
  );
}

interface ElementArrayBuilderProps {
  readonly group: ConceptMapGroup;
  readonly sourceBinding: string | undefined;
  readonly targetBinding: string | undefined;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (elements: ConceptMapGroupElement[]) => void;
}

function ElementArrayBuilder(props: ElementArrayBuilderProps): JSX.Element {
  const elements = props.group.element ?? [];
  const [filter, setFilter] = useState<ElementFilter>('all');
  const [search, setSearch] = useState('');

  const mapped = elements.filter((e) => e.target && e.target.length > 0).length;
  const filtered = elements.filter((e) => matchesFilter(e, filter) && matchesSearch(e, search));
  const narrowed = filter !== 'all' || search.trim().length > 0;
  const capped = filtered.slice(0, RENDER_CAP);

  // Always render the selected row, even when it falls outside the display cap. Otherwise
  // "Add mapping" on a map larger than the cap appends an auto-selected row that is never shown,
  // so the button looks broken while silently accumulating blank elements.
  if (props.selectedKey && !capped.some((e) => e.id === props.selectedKey)) {
    const selected = filtered.find((e) => e.id === props.selectedKey);
    if (selected) {
      capped.push(selected);
    }
  }

  function changeElement(changedElement: ConceptMapGroupElement): void {
    props.onChange(elements.map((e) => (e.id === changedElement.id ? changedElement : e)));
  }

  function addElement(): void {
    const newElement: ConceptMapGroupElement = { id: generateId() };
    props.onChange([...elements, newElement]);
    props.setSelectedKey(newElement.id);
    // Clear any narrowing so the new blank row is actually reachable in the list.
    setFilter('all');
    setSearch('');
  }

  function removeElement(removedElement: ConceptMapGroupElement): void {
    props.onChange(elements.filter((e) => e !== removedElement));
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" className={classes.toolbar} wrap="wrap" gap="sm">
        <Text size="sm" c="dimmed" data-testid="coverage-counter">
          Coverage: {mapped} of {elements.length} source codes mapped
          {narrowed && ` · ${filtered.length.toLocaleString()} shown`}
        </Text>
        <Group gap="xs">
          <TextInput
            aria-label="Search mappings"
            size="xs"
            w={240}
            placeholder="Search code, display, or comment"
            value={search}
            onKeyDown={blockEnterSubmit}
            onChange={(e) => setSearch(e.currentTarget.value)}
            rightSection={
              search ? <CloseButton size="xs" aria-label="Clear search" onClick={() => setSearch('')} /> : undefined
            }
          />
          <NativeSelect
            aria-label="Filter mappings"
            size="xs"
            w={140}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value as ElementFilter)}
            data={[
              { value: 'all', label: 'All' },
              { value: 'mapped', label: 'Mapped' },
              { value: 'unmapped', label: 'Unmapped' },
              { value: 'nomap', label: 'No-map' },
            ]}
          />
        </Group>
      </Flex>

      {filtered.length > RENDER_CAP && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" mb="xs" data-testid="render-cap-banner">
          Showing {RENDER_CAP.toLocaleString()} of {filtered.length.toLocaleString()} mappings
          {narrowed && ' matching the current search and filter'}. Search or filter to narrow the list — browser
          find-in-page only sees the rows rendered here.
        </Alert>
      )}

      {narrowed && filtered.length === 0 && (
        <Text size="sm" c="dimmed" fs="italic" py="sm" data-testid="no-matches">
          No mappings match the current search and filter.
        </Text>
      )}

      <div className={cx(classes.row, classes.columnHeader)}>
        <div className={classes.rowContent}>
          <Text fw={600} size="xs">
            SOURCE CODE
          </Text>
          <Text fw={600} size="xs">
            RELATIONSHIP
          </Text>
          <Text fw={600} size="xs">
            TARGET(S)
          </Text>
        </div>
        <span />
      </div>

      {capped.map((element) => (
        <ElementBuilder
          key={element.id}
          element={element}
          sourceBinding={props.sourceBinding}
          targetBinding={props.targetBinding}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onChange={changeElement}
          onRemove={() => removeElement(element)}
        />
      ))}

      <Button
        variant="subtle"
        size="sm"
        mt="xs"
        leftSection={<IconPlus size={16} />}
        onClick={(e: MouseEvent) => {
          killEvent(e);
          addElement();
        }}
      >
        Add mapping
      </Button>
    </Box>
  );
}

interface ElementBuilderProps {
  readonly element: ConceptMapGroupElement;
  readonly sourceBinding: string | undefined;
  readonly targetBinding: string | undefined;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (element: ConceptMapGroupElement) => void;
  readonly onRemove: () => void;
}

function ElementBuilder(props: ElementBuilderProps): JSX.Element {
  const { element } = props;
  const editing = props.selectedKey === element.id;
  const hovering = props.hoverKey === element.id;
  const noMap = isNoMap(element);
  const hasCodedTargets = Boolean(element.target?.some((t) => t.code));
  // Collapsed summary rows are keyboard-operable buttons; expanded (editing) rows are plain
  // containers so their nested inputs/controls aren't wrapped in a button role.
  const collapsed = !editing;

  function onClick(e: SyntheticEvent): void {
    e.stopPropagation();
    props.setSelectedKey(element.id);
  }

  function onHover(e: SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey(element.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    // Only act when the row itself is focused, so Enter/Space typed in a child input is untouched.
    if (e.target !== e.currentTarget) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      props.setSelectedKey(element.id);
    }
  }

  function changeProperty(property: keyof ConceptMapGroupElement, val: any): void {
    props.onChange({ ...element, [property]: val });
  }

  function toggleNoMap(checked: boolean): void {
    if (checked) {
      props.onChange({ ...element, target: [{ id: generateId(), equivalence: 'unmatched' }] });
    } else {
      props.onChange({ ...element, target: [] });
    }
  }

  const className = cx(classes.row, classes.elementRow, {
    [classes.hovering]: hovering && !editing,
    [classes.editing]: editing,
    [classes.noMap]: noMap,
  });

  return (
    <div className={className} data-testid={element.id} onClick={onClick} onMouseOver={onHover} onFocus={onHover}>
      {/* The activatable region deliberately excludes the remove button. `role="button"` has
          presentational children in ARIA, so a nested button is not exposed to screen readers at
          all — keeping them siblings is what makes "Remove mapping" announceable. */}
      <div
        className={classes.rowContent}
        onKeyDown={onKeyDown}
        role={collapsed ? 'button' : undefined}
        tabIndex={collapsed ? 0 : undefined}
        aria-label={collapsed ? `Edit mapping${element.code ? ` ${element.code}` : ''}` : undefined}
      >
        <Box>
          {editing && !noMap ? (
            <CodingInput
              path=""
              name={`source-${element.id}`}
              binding={props.sourceBinding}
              disabled={!props.sourceBinding && !editing}
              placeholder={props.sourceBinding ? 'Search source code' : 'Enter source code'}
              defaultValue={element.code ? { code: element.code, display: element.display } : undefined}
              onChange={(coding?: Coding) => {
                props.onChange({ ...element, code: coding?.code, display: coding?.display });
              }}
            />
          ) : (
            <CodeSummary code={element.code} display={element.display} placeholder="No source code" />
          )}
        </Box>

        <Box>
          {noMap ? (
            <Badge color="gray" variant="light">
              unmatched
            </Badge>
          ) : (
            <TargetRelationshipSummary element={element} />
          )}
        </Box>

        <Box>
          {noMap ? (
            <Text c="dimmed" fs="italic" size="sm">
              — no equivalent
            </Text>
          ) : (
            <TargetArrayBuilder
              element={element}
              editing={editing}
              targetBinding={props.targetBinding}
              onChange={(targets) => changeProperty('target', targets)}
            />
          )}
          {editing && (
            <Group gap="xs" mt="xs">
              <label className={classes.noMapToggle}>
                <input
                  type="checkbox"
                  checked={noMap}
                  // Marking no-map replaces every target, so block it while coded targets exist
                  // rather than silently discarding the user's mappings.
                  disabled={hasCodedTargets}
                  aria-label="No equivalent"
                  onChange={(e) => toggleNoMap(e.currentTarget.checked)}
                />
                <Text component="span" size="xs" c="dimmed">
                  No equivalent
                </Text>
              </label>
              {hasCodedTargets && (
                <Text size="xs" c="dimmed" fs="italic">
                  Remove the targets below first
                </Text>
              )}
            </Group>
          )}
        </Box>
      </div>

      <CloseButton
        aria-label="Remove mapping"
        data-testid={`remove-element-${element.id}`}
        onClick={(e) => {
          killEvent(e);
          props.onRemove();
        }}
      />
    </div>
  );
}

interface TargetArrayBuilderProps {
  readonly element: ConceptMapGroupElement;
  readonly editing: boolean;
  readonly targetBinding: string | undefined;
  readonly onChange: (targets: ConceptMapGroupElementTarget[]) => void;
}

function TargetArrayBuilder(props: TargetArrayBuilderProps): JSX.Element {
  const targets = props.element.target ?? [];

  function changeTarget(changedTarget: ConceptMapGroupElementTarget): void {
    props.onChange(targets.map((t) => (t.id === changedTarget.id ? changedTarget : t)));
  }

  function addTarget(): void {
    props.onChange([...targets, { id: generateId() } as ConceptMapGroupElementTarget]);
  }

  function removeTarget(removedTarget: ConceptMapGroupElementTarget): void {
    props.onChange(targets.filter((t) => t !== removedTarget));
  }

  if (!props.editing) {
    return (
      <Stack gap={4}>
        {targets.length === 0 && <CodeSummary placeholder="Not yet mapped" />}
        {targets.map((target) => (
          <Box key={target.id}>
            <CodeSummary code={target.code} display={target.display} placeholder="No target code" />
            {/* Comments carry the rationale for narrower/inexact maps, so keep them visible in
                the collapsed row instead of hiding them behind an expand. */}
            {target.comment && (
              <Text size="xs" c="dimmed" fs="italic">
                {target.comment}
              </Text>
            )}
          </Box>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {targets.map((target) => (
        <TargetBuilder
          key={target.id}
          target={target}
          targetBinding={props.targetBinding}
          onChange={changeTarget}
          onRemove={() => removeTarget(target)}
        />
      ))}
      <Button
        variant="subtle"
        size="xs"
        leftSection={<IconPlus size={14} />}
        onClick={(e: MouseEvent) => {
          killEvent(e);
          addTarget();
        }}
      >
        add target
      </Button>
    </Stack>
  );
}

interface TargetBuilderProps {
  readonly target: ConceptMapGroupElementTarget;
  readonly targetBinding: string | undefined;
  readonly onChange: (target: ConceptMapGroupElementTarget) => void;
  readonly onRemove: () => void;
}

function TargetBuilder(props: TargetBuilderProps): JSX.Element {
  const { target } = props;

  function changeProperty(property: keyof ConceptMapGroupElementTarget, val: any): void {
    props.onChange({ ...target, [property]: val });
  }

  const missingEquivalence = Boolean(target.code) && !target.equivalence;
  const commentRequired = COMMENT_REQUIRED.includes(target.equivalence);
  const missingComment = commentRequired && !target.comment;

  return (
    <Box className={classes.target}>
      <Flex gap="xs" align="flex-start">
        <Box style={{ flex: 1 }}>
          <CodingInput
            path=""
            name={`target-${target.id}`}
            binding={props.targetBinding}
            placeholder={props.targetBinding ? 'Search target code' : 'Enter target code'}
            defaultValue={target.code ? { code: target.code, display: target.display } : undefined}
            onChange={(coding?: Coding) => {
              props.onChange({ ...target, code: coding?.code, display: coding?.display });
            }}
          />
        </Box>
        <Select
          aria-label="Relationship"
          placeholder="relationship *"
          w={220}
          required
          searchable
          allowDeselect={false}
          error={missingEquivalence ? 'Required' : undefined}
          value={target.equivalence ?? null}
          data={EQUIVALENCE_OPTIONS}
          onChange={(v) => changeProperty('equivalence', (v as Equivalence) ?? undefined)}
        />
        <CloseButton
          aria-label="Remove target"
          data-testid={`remove-target-${target.id}`}
          onClick={(e) => {
            killEvent(e);
            props.onRemove();
          }}
        />
      </Flex>
      <TextInput
        mt="xs"
        size="xs"
        aria-label="Comment"
        onKeyDown={blockEnterSubmit}
        required={commentRequired}
        error={missingComment ? `Required for ${target.equivalence} mappings` : undefined}
        placeholder={commentRequired ? `Comment (required for ${target.equivalence})` : 'Comment (optional)'}
        defaultValue={target.comment}
        onChange={(e) => changeProperty('comment', e.currentTarget.value || undefined)}
      />
    </Box>
  );
}

interface CodeSummaryProps {
  readonly code?: string;
  readonly display?: string;
  readonly placeholder?: string;
}

function CodeSummary(props: CodeSummaryProps): JSX.Element {
  if (!props.code && !props.display) {
    return (
      <Text c="dimmed" fs="italic" size="sm">
        {props.placeholder ?? '—'}
      </Text>
    );
  }
  return (
    <Text size="sm">
      {props.code && (
        <Text component="span" fw={600} mr={6}>
          {props.code}
        </Text>
      )}
      {props.display}
    </Text>
  );
}

function TargetRelationshipSummary(props: { readonly element: ConceptMapGroupElement }): JSX.Element {
  const targets = props.element.target ?? [];
  if (targets.length === 0) {
    return (
      <Text c="dimmed" fs="italic" size="sm">
        —
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {targets.map((t) => (
        <Badge key={t.id} variant="light" color={equivalenceColor(t.equivalence)}>
          {t.equivalence ?? 'unset'}
        </Badge>
      ))}
    </Stack>
  );
}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

// Every group repeats the same control names (source system, search, filter, remove mapping), and
// nothing else on screen distinguishes them. Naming the group makes a screen reader announce which
// one you have entered, without renaming the controls themselves.
function groupLabel(group: ConceptMapGroup, index: number): string {
  const ordinal = `Group ${index + 1}`;
  if (group.source && group.target) {
    return `${ordinal}: ${group.source} to ${group.target}`;
  }
  return ordinal;
}

// Returns the id of the first element owning a target that needs a comment but lacks one.
// FHIR invariant cmd-1 makes comments mandatory for narrower/inexact, and the server rejects
// the whole save with a raw constraint error, so catch it before submitting.
function findMissingComment(conceptMap: ConceptMap): string | undefined {
  for (const group of conceptMap.group ?? []) {
    for (const element of group.element ?? []) {
      for (const target of element.target ?? []) {
        if (COMMENT_REQUIRED.includes(target.equivalence) && !target.comment) {
          return element.id;
        }
      }
    }
  }
  return undefined;
}

// Returns the id of the first element that owns a target with a code but no equivalence, or
// undefined if every coded target has a relationship. Enforces "equivalence required, no default".
function findMissingEquivalence(conceptMap: ConceptMap): string | undefined {
  for (const group of conceptMap.group ?? []) {
    for (const element of group.element ?? []) {
      for (const target of element.target ?? []) {
        if (target.code && !target.equivalence) {
          return element.id;
        }
      }
    }
  }
  return undefined;
}

// Drop groups the user never touched: no source, no target, and no elements. Display-only slices
// never reach here, so a partially-viewed large map still saves every element.
function pruneEmptyGroups(conceptMap: ConceptMap): ConceptMap {
  const group = (conceptMap.group ?? []).filter((g) => g.source || g.target || (g.element && g.element.length > 0));
  return { ...conceptMap, group };
}

// Injects synthetic `id` on every group, element, and target that lacks one. These are valid
// FHIR `Element.id` values used only as stable React keys; they round-trip harmlessly.
function ensureConceptMapKeys(conceptMap: ConceptMap): ConceptMap {
  let group = conceptMap.group?.map((g) => ({
    ...g,
    id: generateId(g.id),
    element: g.element?.map((element) => ({
      ...element,
      id: generateId(element.id),
      target: element.target?.map((target) => ({
        ...target,
        id: generateId(target.id),
      })),
    })),
  }));

  // Auto-first-group: land the user directly on an editable blank group.
  if (!group || group.length === 0) {
    group = [{ id: generateId(), element: [] }];
  }

  return { ...conceptMap, group };
}

let nextId = 1;

/**
 * Generates a unique id for React keys. Mirrors PlanDefinitionBuilder's generateId: if an
 * existing id is passed it is preserved (and advances the counter past it).
 * @param existing - Optional existing id which will update nextId.
 * @returns A unique key.
 */
function generateId(existing?: string): string {
  if (existing) {
    if (existing.startsWith('id-')) {
      const existingNum = Number.parseInt(existing.substring(3), 10);
      if (!Number.isNaN(existingNum)) {
        nextId = Math.max(nextId, existingNum + 1);
      }
    }
    return existing;
  }
  return 'id-' + nextId++;
}
