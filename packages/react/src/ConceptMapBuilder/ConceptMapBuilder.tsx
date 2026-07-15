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
import type { JSX, MouseEvent, SyntheticEvent } from 'react';
import { useEffect, useState } from 'react';
import { CodingInput } from '../CodingInput/CodingInput';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { ResourceInput } from '../ResourceInput/ResourceInput';
import { killEvent } from '../utils/dom';
import classes from './ConceptMapBuilder.module.css';

/**
 * The FHIR R4 equivalence value set (ConceptMapEquivalence). All ten values are supported
 * for round-trip fidelity; the common subset is surfaced above the divider in the Select.
 */
type Equivalence = ConceptMapGroupElementTarget['equivalence'];

const EQUIVALENCE_OPTIONS = [
  {
    group: 'Common',
    items: [
      { value: 'equivalent', label: 'equivalent — same meaning' },
      { value: 'wider', label: 'wider — target is more general' },
      { value: 'narrower', label: 'narrower — target is more specific' },
      { value: 'inexact', label: 'inexact — related, not exact' },
      { value: 'unmatched', label: 'unmatched — no equivalent' },
    ],
  },
  {
    group: 'Precise / rare',
    items: [
      { value: 'relatedto', label: 'relatedto' },
      { value: 'equal', label: 'equal' },
      { value: 'subsumes', label: 'subsumes' },
      { value: 'specializes', label: 'specializes' },
      { value: 'disjoint', label: 'disjoint' },
    ],
  },
];

/**
 * Display-only cap: only the first RENDER_CAP filtered rows are rendered. Filtering happens
 * against the full element array; the cap never mutates `value`, so save writes every element.
 */
const RENDER_CAP = 200;

/**
 * Hard read-only backstop: above this many elements the visual builder can't be safely
 * rendered or diffed by hand, so it drops to read-only and directs the user to the JSON tab.
 */
const EDIT_LIMIT = 10_000;

type ElementFilter = 'all' | 'unmapped' | 'nomap';

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
    setError(undefined);
    props.onSubmit(pruneEmptyGroups(value as ConceptMap));
  }

  return (
    <div>
      <Form testid="conceptmap-form" onSubmit={handleSubmit}>
        {readOnly && (
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="yellow"
            title="Map too large to edit visually"
            mb="md"
          >
            This ConceptMap has {totalElements.toLocaleString()} mappings, above the {EDIT_LIMIT.toLocaleString()}
            -row visual editing limit. It is shown read-only here — edit it on the JSON tab or via import tooling.
          </Alert>
        )}
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" mb="md" data-testid="conceptmap-error">
            {error}
          </Alert>
        )}
        <GroupArrayBuilder
          resource={value}
          groups={value.group ?? []}
          readOnly={readOnly}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          hoverKey={hoverKey}
          setHoverKey={setHoverKey}
          onChange={(x) => changeProperty('group', x)}
        />
        {!readOnly && <SubmitButton mt="md">Save</SubmitButton>}
      </Form>
    </div>
  );
}

interface GroupArrayBuilderProps {
  readonly resource: ConceptMap;
  readonly groups: ConceptMapGroup[];
  readonly readOnly: boolean;
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
      {groups.map((group) => (
        <GroupBuilder
          key={group.id}
          resource={props.resource}
          group={group}
          collapsible={!singleGroup}
          readOnly={props.readOnly}
          selectedKey={props.selectedKey}
          setSelectedKey={props.setSelectedKey}
          hoverKey={props.hoverKey}
          setHoverKey={props.setHoverKey}
          onChange={changeGroup}
          onRemove={() => removeGroup(group)}
        />
      ))}
      {!props.readOnly && (
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
      )}
    </Stack>
  );
}

interface GroupBuilderProps {
  readonly resource: ConceptMap;
  readonly group: ConceptMapGroup;
  readonly collapsible: boolean;
  readonly readOnly: boolean;
  readonly selectedKey: string | undefined;
  readonly setSelectedKey: (key: string | undefined) => void;
  readonly hoverKey: string | undefined;
  readonly setHoverKey: (key: string | undefined) => void;
  readonly onChange: (group: ConceptMapGroup) => void;
  readonly onRemove: () => void;
}

function GroupBuilder(props: GroupBuilderProps): JSX.Element {
  const { group, resource, readOnly } = props;

  // UI-only binding state, resolved when the user picks a CodeSystem in SystemInput.
  const [sourceBinding, setSourceBinding] = useState<string | undefined>(resource.sourceCanonical);
  const [targetBinding, setTargetBinding] = useState<string | undefined>(resource.targetCanonical);

  function changeProperty(property: keyof ConceptMapGroup, val: any): void {
    props.onChange({ ...group, [property]: val });
  }

  return (
    <Box className={classes.group} data-testid={group.id}>
      <Flex className={classes.header} gap="lg" align="flex-end" wrap="wrap">
        <SystemInput
          label="Source system"
          disabled={readOnly}
          system={group.source}
          version={group.sourceVersion}
          onChangeSystem={(url, version, binding) => {
            props.onChange({ ...group, source: url, sourceVersion: version });
            setSourceBinding(resource.sourceCanonical ?? binding);
          }}
        />
        <Text mb={6} c="dimmed">
          →
        </Text>
        <SystemInput
          label="Target system"
          disabled={readOnly}
          system={group.target}
          version={group.targetVersion}
          onChangeSystem={(url, version, binding) => {
            props.onChange({ ...group, target: url, targetVersion: version });
            setTargetBinding(resource.targetCanonical ?? binding);
          }}
        />
        {props.collapsible && !readOnly && (
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
      <ElementArrayBuilder
        group={group}
        readOnly={readOnly}
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
  readonly disabled: boolean;
  readonly system: string | undefined;
  readonly version: string | undefined;
  readonly onChangeSystem: (url: string | undefined, version: string | undefined, binding: string | undefined) => void;
}

// Picks a code system for a group. Preferred path: choose a CodeSystem resource, which stores
// its canonical `url` into `group.source`/`group.target` and surfaces `CodeSystem.valueSet` as
// the picker binding. Manual-URL fallback (spec §9.2c) supports systems not loaded as resources.
function SystemInput(props: SystemInputProps): JSX.Element {
  const [manual, setManual] = useState(false);

  if (manual) {
    return (
      <Box>
        <TextInput
          label={props.label}
          placeholder="https://example.org/CodeSystem/…"
          disabled={props.disabled}
          defaultValue={props.system}
          onChange={(e) => props.onChangeSystem(e.currentTarget.value || undefined, undefined, undefined)}
        />
        <Anchor size="xs" component="button" type="button" onClick={() => setManual(false)}>
          Pick a CodeSystem instead
        </Anchor>
      </Box>
    );
  }

  return (
    <Box>
      <ResourceInput<CodeSystem>
        label={props.label}
        name={`system-${props.label}`}
        resourceType="CodeSystem"
        disabled={props.disabled}
        placeholder={props.system ?? 'Search for a CodeSystem'}
        onChange={(codeSystem) =>
          props.onChangeSystem(codeSystem?.url, codeSystem?.version, codeSystem?.valueSet)
        }
      />
      {props.system && (
        <Text size="xs" c="dimmed">
          {props.system}
        </Text>
      )}
      <Anchor size="xs" component="button" type="button" onClick={() => setManual(true)}>
        Enter URL manually
      </Anchor>
    </Box>
  );
}

interface ElementArrayBuilderProps {
  readonly group: ConceptMapGroup;
  readonly readOnly: boolean;
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

  const mapped = elements.filter((e) => e.target && e.target.length > 0).length;
  const filtered = elements.filter((e) => matchesFilter(e, filter));
  const capped = filtered.slice(0, RENDER_CAP);

  function changeElement(changedElement: ConceptMapGroupElement): void {
    props.onChange(elements.map((e) => (e.id === changedElement.id ? changedElement : e)));
  }

  function addElement(): void {
    const newElement: ConceptMapGroupElement = { id: generateId() };
    props.onChange([...elements, newElement]);
    props.setSelectedKey(newElement.id);
  }

  function removeElement(removedElement: ConceptMapGroupElement): void {
    props.onChange(elements.filter((e) => e !== removedElement));
  }

  return (
    <Box>
      <Flex justify="space-between" align="center" className={classes.toolbar} wrap="wrap" gap="sm">
        <Text size="sm" c="dimmed" data-testid="coverage-counter">
          Coverage: {mapped} of {elements.length} source codes mapped
        </Text>
        <NativeSelect
          aria-label="Filter mappings"
          size="xs"
          w={160}
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value as ElementFilter)}
          data={[
            { value: 'all', label: 'All' },
            { value: 'unmapped', label: 'Unmapped' },
            { value: 'nomap', label: 'No-map' },
          ]}
        />
      </Flex>

      {filtered.length > RENDER_CAP && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" mb="xs" data-testid="render-cap-banner">
          Showing {RENDER_CAP.toLocaleString()} of {filtered.length.toLocaleString()} mappings. Use the filter to
          narrow, or edit large maps via the JSON tab.
        </Alert>
      )}

      <div className={cx(classes.row, classes.columnHeader)}>
        <Text fw={600} size="xs">
          SOURCE CODE
        </Text>
        <Text fw={600} size="xs">
          RELATIONSHIP
        </Text>
        <Text fw={600} size="xs">
          TARGET(S)
        </Text>
        <span />
      </div>

      {capped.map((element) => (
        <ElementBuilder
          key={element.id}
          element={element}
          readOnly={props.readOnly}
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

      {!props.readOnly && (
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
      )}
    </Box>
  );
}

interface ElementBuilderProps {
  readonly element: ConceptMapGroupElement;
  readonly readOnly: boolean;
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
  const { element, readOnly } = props;
  const editing = props.selectedKey === element.id;
  const hovering = props.hoverKey === element.id;
  const noMap = isNoMap(element);

  function onClick(e: SyntheticEvent): void {
    if (readOnly) {
      return;
    }
    e.stopPropagation();
    props.setSelectedKey(element.id);
  }

  function onHover(e: SyntheticEvent): void {
    killEvent(e);
    props.setHoverKey(element.id);
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
    [classes.hovering]: hovering && !editing && !readOnly,
    [classes.editing]: editing,
    [classes.noMap]: noMap,
  });

  return (
    <div className={className} data-testid={element.id} onClick={onClick} onMouseOver={onHover} onFocus={onHover}>
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
            readOnly={readOnly}
            targetBinding={props.targetBinding}
            onChange={(targets) => changeProperty('target', targets)}
          />
        )}
        {editing && !readOnly && (
          <Group gap="xs" mt="xs">
            <label className={classes.noMapToggle}>
              <input
                type="checkbox"
                checked={noMap}
                aria-label="No equivalent"
                onChange={(e) => toggleNoMap(e.currentTarget.checked)}
              />
              <Text component="span" size="xs" c="dimmed">
                No equivalent
              </Text>
            </label>
          </Group>
        )}
      </Box>

      {!readOnly && (
        <CloseButton
          aria-label="Remove mapping"
          data-testid={`remove-element-${element.id}`}
          onClick={(e) => {
            killEvent(e);
            props.onRemove();
          }}
        />
      )}
    </div>
  );
}

interface TargetArrayBuilderProps {
  readonly element: ConceptMapGroupElement;
  readonly editing: boolean;
  readonly readOnly: boolean;
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
          <CodeSummary key={target.id} code={target.code} display={target.display} placeholder="No target code" />
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
      {!props.readOnly && (
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
      )}
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
        placeholder="Comment (optional)"
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
      {props.code && <Text component="span" fw={600} mr={6}>{props.code}</Text>}
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

function equivalenceColor(equivalence: Equivalence | undefined): string {
  switch (equivalence) {
    case 'equivalent':
    case 'equal':
      return 'green';
    case 'wider':
    case 'narrower':
    case 'subsumes':
    case 'specializes':
      return 'blue';
    case 'inexact':
    case 'relatedto':
      return 'yellow';
    case 'unmatched':
    case 'disjoint':
      return 'gray';
    default:
      return 'red';
  }
}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

// A "no-map" row is a single target with equivalence `unmatched` and no code — the R4 way to
// record "reviewed, no equivalent" (spec §9.1). Distinct from a not-yet-mapped (empty) row.
function isNoMap(element: ConceptMapGroupElement): boolean {
  const targets = element.target;
  return targets?.length === 1 && targets[0].equivalence === 'unmatched' && !targets[0].code;
}

function matchesFilter(element: ConceptMapGroupElement, filter: ElementFilter): boolean {
  switch (filter) {
    case 'unmapped':
      return !element.target || element.target.length === 0;
    case 'nomap':
      return isNoMap(element);
    default:
      return true;
  }
}

function countElements(conceptMap: ConceptMap): number {
  return (conceptMap.group ?? []).reduce((sum, group) => sum + (group.element?.length ?? 0), 0);
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
  const group = (conceptMap.group ?? []).filter(
    (g) => g.source || g.target || (g.element && g.element.length > 0)
  );
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
