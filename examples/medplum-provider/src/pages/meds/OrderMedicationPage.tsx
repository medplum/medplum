// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  Input,
  NumberInput,
  Radio,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { MedicationOrderDrugInput, MedplumClient, WithId } from '@medplum/core';
import { getPreferredPharmaciesFromPatient, getReferenceString, NDC, RXNORM, createReference } from '@medplum/core';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { AsyncAutocomplete, Panel, ResourceInput, useMedplum } from '@medplum/react';
import type {
  Condition,
  Coverage,
  Medication,
  MedicationRequest,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
} from '@medplum/fhirtypes';
import {
  loadScriptSureQuantityQualifiers,
  SCRIPTSURE_GENERIC_NAME_EXTENSION,
  SCRIPTSURE_NAME_TYPE_EXTENSION,
  SCRIPTSURE_ROUTED_MED_ID_SYSTEM,
  SCRIPTSURE_SIG_EXTENSION,
  useScriptSureOrderMedication,
} from '@medplum/scriptsure-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import {
  buildQualifierMatcher,
  inferQuantityQualifierCodeWith,
  mergeQuantityQualifierCatalog,
  STATIC_QUALIFIER_MATCHER,
} from '../../components/meds/quantity-qualifiers';
import type { QualifierMatcher } from '../../components/meds/quantity-qualifiers';

const DEFAULT_QUANTITY_QUALIFIER = 'C48542';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface OrderMedicationPageProps {
  /** When set (e.g. from the patient chart), the form shows and uses this patient immediately. */
  patient?: Patient;
  onOrderComplete?: (result: { launchUrl: string; medicationRequestId?: string }) => void;
}

function getRoutedMedIdFromMedication(m: Medication): number | undefined {
  const v =
    m.identifier?.find((i) => i.system === SCRIPTSURE_ROUTED_MED_ID_SYSTEM)?.value ??
    m.code?.coding?.find((c) => c.system === SCRIPTSURE_ROUTED_MED_ID_SYSTEM)?.code;
  if (!v) {
    return undefined;
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeNdcDigits(ndc: string | undefined): string | undefined {
  if (!ndc) {
    return undefined;
  }
  const digits = ndc.replaceAll(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

/**
 * Stable key for search deduplication and AsyncAutocomplete option values (avoids duplicate rows).
 *
 * NDC and RxNorm are checked **before** routed-med-id because format lookups
 * (`searchMedications({ routedMedId })`) return many strengths sharing the same
 * routed-med-id — keying by routed-med-id alone would collapse every strength
 * into a single option. Routed-med-id is only the fallback for high-level
 * name-search rows that have no NDC / RxNorm yet.
 * @param m - In-memory Medication from drug search / format lookup.
 * @returns Dedupe key (NDC, RxNorm, routed id, or text/json fallback).
 */
function medicationDedupeKey(m: Medication): string {
  const ndc =
    m.code?.coding?.find((c) => c.system === NDC)?.code ?? m.identifier?.find((i) => i.system === NDC)?.value;
  const nd = normalizeNdcDigits(ndc);
  if (nd) {
    return `ndc:${nd}`;
  }
  const rx =
    m.code?.coding?.find((c) => c.system === RXNORM)?.code ??
    m.identifier?.find((i) => i.system === RXNORM)?.value;
  if (rx) {
    return `rx:${rx.trim()}`;
  }
  const rid = getRoutedMedIdFromMedication(m);
  if (rid !== undefined) {
    return `routed:${rid}`;
  }
  const text = m.code?.text?.trim();
  if (text) {
    return `text:${text.toLowerCase()}`;
  }
  return `json:${JSON.stringify(m.code ?? {})}`;
}

function dedupeMedications(list: Medication[]): Medication[] {
  const map = new Map<string, Medication>();
  for (const m of list) {
    const k = medicationDedupeKey(m);
    if (!map.has(k)) {
      map.set(k, m);
    }
  }
  return [...map.values()];
}

/**
 * Parses a free-text sig line (e.g. "Take 1 tablet by mouth twice daily") into a
 * per-dose × per-day estimate used to pre-fill days supply.
 *
 * Returns undefined when no frequency keyword is recognized so the caller can
 * leave the previous days-supply value untouched rather than guessing.
 *
 * @param sigLine - The sig line text (English).
 * @returns `{ perDose, dosesPerDay }` or `undefined` when frequency is unknown.
 */
function inferDailyDoseFromSig(sigLine: string): { perDose: number; dosesPerDay: number } | undefined {
  if (!sigLine) {
    return undefined;
  }
  const text = sigLine.toLowerCase();

  let perDose = 1;
  const verbMatch = text.match(
    /\b(?:take|apply|use|inject|inhale|instill|insert|chew|dissolve|spray)\s+(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?/
  );
  if (verbMatch) {
    const lo = parseFloat(verbMatch[1]);
    const hi = verbMatch[2] ? parseFloat(verbMatch[2]) : lo;
    perDose = Number.isFinite(hi) && hi > 0 ? hi : lo;
  }

  let dosesPerDay = 0;
  if (/\bqid\b|four\s+times|\b4\s*x\b/.test(text)) {
    dosesPerDay = 4;
  } else if (/\btid\b|three\s+times|\b3\s*x\b/.test(text)) {
    dosesPerDay = 3;
  } else if (/\bbid\b|twice/.test(text)) {
    dosesPerDay = 2;
  } else if (/once\s+(?:a\s+)?day|once\s+daily|every\s+day|\bqd\b|\bqday\b|\bdaily\b/.test(text)) {
    dosesPerDay = 1;
  }

  if (!dosesPerDay) {
    const everyHrs = text.match(/every\s+(\d+(?:\.\d+)?)\s*(?:hr|hour|hours)\b|\bq(\d+)h\b/);
    if (everyHrs) {
      const h = parseFloat(everyHrs[1] ?? everyHrs[2]);
      if (Number.isFinite(h) && h > 0) {
        dosesPerDay = 24 / h;
      }
    }
  }

  if (!dosesPerDay) {
    const everyDays = text.match(/every\s+(\d+(?:\.\d+)?)\s*(?:d|day|days)\b/);
    if (everyDays) {
      const d = parseFloat(everyDays[1]);
      if (Number.isFinite(d) && d > 0) {
        dosesPerDay = 1 / d;
      }
    }
  }

  if (!dosesPerDay) {
    return undefined;
  }
  return { perDose, dosesPerDay };
}

/**
 * Estimates days supply from a sig line and dispense quantity.
 *
 * @param sigLine - Sig text like "Take 1 tablet by mouth twice daily".
 * @param quantity - Dispense quantity (e.g. 30 tablets).
 * @returns Whole-day estimate, or `undefined` when the sig has no parseable frequency.
 */
function inferDaysSupplyFromSig(sigLine: string, quantity: number): number | undefined {
  if (!quantity || quantity <= 0) {
    return undefined;
  }
  const inferred = inferDailyDoseFromSig(sigLine);
  if (!inferred) {
    return undefined;
  }
  const perDay = inferred.perDose * inferred.dosesPerDay;
  if (perDay <= 0) {
    return undefined;
  }
  const days = Math.floor(quantity / perDay);
  return days > 0 ? days : undefined;
}

interface ParsedSig {
  sigLine: string;
  quantity: number;
  /** Resolved NCI potency-unit code (ScriptSure value when explicit, else inferred from sig + formulation text, else default tablet). */
  quantityQualifier: string;
  /** Raw value from ScriptSure (undefined when the API omitted it). Useful for callers that want to distinguish "explicit" from "inferred". */
  quantityQualifierRaw: string | undefined;
}

/**
 * Resolves the dispense unit (NCI potency code) for a sig.
 *
 * The ScriptSure drug-search bot defaults missing qualifiers to `C48542`
 * (tablet), so a raw "tablet" code is ambiguous: it may mean "ScriptSure said
 * tablet" or "ScriptSure said nothing — we filled in tablet". In that case we
 * re-derive the code from the sig text + formulation label so e.g. an Anusol-HC
 * rectal suppository sig ends up as `C48486` (Suppository) instead of `C48542`.
 *
 * Priority:
 *  1. Explicit non-tablet `quantityQualifier` from the ScriptSure sig payload.
 *  2. Keyword inference from sig line and formulation label (e.g.
 *     "rectal suppository" → C48486 Suppository).
 *  3. Whatever ScriptSure sent (or the static `C48542` Tablet fallback).
 *
 * @param raw - Value returned by ScriptSure on the sig (may be undefined).
 * @param sigLine - Sig text shown to the prescriber.
 * @param formatText - Formulation label (e.g. drug `code.text`) when known.
 * @param matcher - Catalog-aware matcher (live `/v3/prescription/quantityqualifier`
 *   or static fallback) used for keyword inference.
 * @returns NCI potency-unit code; never empty.
 */
function resolveQuantityQualifier(
  raw: string | undefined,
  sigLine: string,
  formatText: string | undefined,
  matcher: QualifierMatcher
): string {
  const trimmed = raw?.trim();
  if (trimmed && trimmed !== DEFAULT_QUANTITY_QUALIFIER) {
    return trimmed;
  }
  const inferred = inferQuantityQualifierCodeWith(matcher, sigLine, formatText);
  if (inferred) {
    return inferred;
  }
  return trimmed || DEFAULT_QUANTITY_QUALIFIER;
}

function parseScriptSureSigs(medication: Medication, matcher: QualifierMatcher): ParsedSig[] {
  const formatText = medication.code?.text;
  const out: ParsedSig[] = [];
  for (const ext of medication.extension ?? []) {
    if (ext.url !== SCRIPTSURE_SIG_EXTENSION) {
      continue;
    }
    const nested = ext.extension ?? [];
    const sigLine = nested.find((n) => n.url === 'sigLine')?.valueString ?? '';
    const quantity = nested.find((n) => n.url === 'quantity')?.valueInteger ?? 1;
    const quantityQualifierRaw = nested.find((n) => n.url === 'quantityQualifier')?.valueString;
    if (sigLine) {
      out.push({
        sigLine,
        quantity,
        quantityQualifier: resolveQuantityQualifier(quantityQualifierRaw, sigLine, formatText, matcher),
        quantityQualifierRaw,
      });
    }
  }
  return out;
}

type BrandOrGeneric = 'brand' | 'generic' | undefined;

/**
 * Reads ScriptSure MED_NAME_TYPE_CD from a search-result Medication extension.
 * @param m - In-memory Medication from drug name search.
 * @returns `'brand'` for `'1'`, `'generic'` for `'2'`, otherwise undefined.
 */
function getBrandOrGeneric(m: Medication): BrandOrGeneric {
  const v = m.extension?.find((e) => e.url === SCRIPTSURE_NAME_TYPE_EXTENSION)?.valueString;
  if (v === '1') {
    return 'brand';
  }
  if (v === '2') {
    return 'generic';
  }
  return undefined;
}

/**
 * Reads the parent generic name (when the row is a brand) from a search-result Medication.
 * @param m - In-memory Medication from drug name search.
 * @returns Generic name string, or undefined.
 */
function getGenericName(m: Medication): string | undefined {
  return m.extension?.find((e) => e.url === SCRIPTSURE_GENERIC_NAME_EXTENSION)?.valueString;
}

function medicationToOrderDrugInput(
  m: Medication,
  opts: {
    sigLine3: string;
    quantity: number;
    refill: number;
    useSubstitution: boolean;
    quantityQualifier?: string;
  }
): MedicationOrderDrugInput {
  const ndc =
    m.code?.coding?.find((c) => c.system === NDC)?.code ?? m.identifier?.find((i) => i.system === NDC)?.value;
  const rxNorm =
    m.code?.coding?.find((c) => c.system === RXNORM)?.code ??
    m.identifier?.find((i) => i.system === RXNORM)?.value;
  const routedMedId = getRoutedMedIdFromMedication(m);
  return {
    ...(ndc ? { ndc } : {}),
    ...(rxNorm ? { rxNorm } : {}),
    ...(routedMedId !== undefined ? { routedMedId } : {}),
    quantity: opts.quantity,
    quantityQualifier: opts.quantityQualifier ?? DEFAULT_QUANTITY_QUALIFIER,
    refill: opts.refill,
    sigLine3: opts.sigLine3,
    useSubstitution: opts.useSubstitution,
  };
}

function medicationToCodeableConcept(m: Medication): MedicationRequest['medicationCodeableConcept'] {
  return {
    coding: m.code?.coding,
    text: m.code?.text,
  };
}

function medicationSearchToOption(m: Medication): AsyncAutocompleteOption<Medication> {
  const label = m.code?.text ?? m.code?.coding?.[0]?.display ?? m.id ?? 'Medication';
  return {
    value: medicationDedupeKey(m),
    label,
    resource: m,
  };
}

function MedicationSearchItem(props: AsyncAutocompleteOption<Medication>): JSX.Element {
  const { resource } = props;
  const kind = getBrandOrGeneric(resource);
  const generic = getGenericName(resource);
  const showGenericLine = kind === 'brand' && generic && generic.toLowerCase() !== props.label.toLowerCase();
  return (
    <Group gap="xs" wrap="nowrap">
      <Stack gap={0} style={{ flex: 1 }}>
        <Group gap={6} wrap="nowrap">
          <span>{props.label}</span>
        </Group>
        {showGenericLine && (
          <Text size="xs" c="dimmed">
            {generic}
          </Text>
        )}
      </Stack>
      {kind === 'brand' && (
        <Badge color="blue" variant="light" size="sm">
          Brand
        </Badge>
      )}
      {kind === 'generic' && (
        <Badge color="gray" variant="light" size="sm">
          Generic
        </Badge>
      )}
    </Group>
  );
}

interface FormulationSigChoice {
  formatIndex: number;
  sigIndex: number;
  formatLabel: string;
  sigLine: string;
  quantity: number;
  quantityQualifier: string;
}

/**
 * Builds a flat list of (formulation × sig) options from drug-format results.
 * If a formulation has no sigs we emit a single placeholder entry so the user can still pick it.
 * @param formats - Deduped Medication[] from `searchMedications({ routedMedId })`.
 * @param matcher - Quantity-qualifier matcher used by `parseScriptSureSigs` to
 *   resolve dispense units when ScriptSure omits them on a sig.
 * @returns One row per selectable formulation+sig pair.
 */
function buildFormulationSigChoices(formats: Medication[], matcher: QualifierMatcher): FormulationSigChoice[] {
  const out: FormulationSigChoice[] = [];
  formats.forEach((fm, fi) => {
    const formatLabel = fm.code?.text ?? `Option ${fi + 1}`;
    const sigs = parseScriptSureSigs(fm, matcher);
    if (sigs.length === 0) {
      out.push({
        formatIndex: fi,
        sigIndex: -1,
        formatLabel,
        sigLine: '',
        quantity: 0,
        quantityQualifier: DEFAULT_QUANTITY_QUALIFIER,
      });
      return;
    }
    sigs.forEach((s, si) => {
      out.push({
        formatIndex: fi,
        sigIndex: si,
        formatLabel,
        sigLine: s.sigLine,
        quantity: s.quantity,
        quantityQualifier: s.quantityQualifier,
      });
    });
  });
  return out;
}

export function OrderMedicationPage(props: OrderMedicationPageProps): JSX.Element {
  const { onOrderComplete, patient: patientProp } = props;
  const medplum = useMedplum();
  const { patientId } = useParams();
  const { searchMedications, orderMedication } = useScriptSureOrderMedication();

  const [patient, setPatient] = useState(patientProp);
  const [requester, setRequester] = useState<Practitioner | undefined>();
  const [activeTab, setActiveTab] = useState('single');

  const [termMedication, setTermMedication] = useState<Medication | undefined>();
  const [formatMedications, setFormatMedications] = useState<Medication[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<Medication | undefined>();
  const [sigIndex, setSigIndex] = useState(0);
  const [quantity, setQuantity] = useState(30);
  const [daysSupply, setDaysSupply] = useState(30);
  const [daysSupplyTouched, setDaysSupplyTouched] = useState(false);
  const [writtenDateYmd, setWrittenDateYmd] = useState(todayYmd);
  const [fillDateYmd, setFillDateYmd] = useState('');
  const [notesPharmacist, setNotesPharmacist] = useState('');
  const [patientInstruction, setPatientInstruction] = useState('');
  const [manualQtyQualifier, setManualQtyQualifier] = useState(DEFAULT_QUANTITY_QUALIFIER);
  const [qualifierCatalog, setQualifierCatalog] = useState<{ code: string; label: string }[]>([]);
  const [refill, setRefill] = useState(0);
  const [useSubstitution, setUseSubstitution] = useState(true);
  const [freeSig, setFreeSig] = useState('');
  const [loadingFormats, setLoadingFormats] = useState(false);

  const [compoundDaysSupply, setCompoundDaysSupply] = useState(30);
  const [compoundWrittenYmd, setCompoundWrittenYmd] = useState(todayYmd);
  const [compoundFillYmd, setCompoundFillYmd] = useState('');
  const [compoundNotesPharmacist, setCompoundNotesPharmacist] = useState('');
  const [compoundPatientInstruction, setCompoundPatientInstruction] = useState('');

  const [primaryCondition, setPrimaryCondition] = useState<Condition | undefined>();
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [pharmacyOrg, setPharmacyOrg] = useState<Organization | undefined>();

  const [compoundLines, setCompoundLines] = useState<
    { id: string; termMed?: Medication; formatMed?: Medication; quantity: number; refill: number; useSubstitution: boolean }[]
  >([
    { id: 'a', quantity: 30, refill: 0, useSubstitution: true },
    { id: 'b', quantity: 30, refill: 0, useSubstitution: true },
  ]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPatient(patientProp);
  }, [patientProp]);

  // Pull the live `[{ potencyUnit, name }]` catalog from
  // `GET /v3/prescription/quantityqualifier` (via scriptsure-drug-search-bot),
  // merge it with the static fallback so the dropdown is populated even on
  // first paint / bot failure, and surface the merged catalog so the keyword
  // matcher (below) is driven by the live names.
  useEffect(() => {
    let cancelled = false;
    loadScriptSureQuantityQualifiers(medplum)
      .then((live) => {
        if (cancelled) {
          return;
        }
        const merged = mergeQuantityQualifierCatalog(
          live.map((row) => ({ potencyUnit: row.code, name: row.label }))
        );
        setQualifierCatalog(merged);
      })
      .catch(() => {
        if (!cancelled) {
          setQualifierCatalog(mergeQuantityQualifierCatalog([]));
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [medplum]);

  const qtyQualifierSelectData = useMemo(
    () => qualifierCatalog.map((r) => ({ value: r.code, label: `${r.label} (${r.code})` })),
    [qualifierCatalog]
  );

  // Keyword matcher built from the live catalog; falls back to STATIC_QUALIFIER_MATCHER
  // until the bot call resolves so prescribers never see "Tablet" frozen on a
  // suppository while the catalog is loading.
  const qualifierMatcher = useMemo<QualifierMatcher>(() => {
    if (qualifierCatalog.length === 0) {
      return STATIC_QUALIFIER_MATCHER;
    }
    return buildQualifierMatcher(qualifierCatalog.map((r) => ({ potencyUnit: r.code, name: r.label })));
  }, [qualifierCatalog]);

  useEffect(() => {
    if (patientProp) {
      return undefined;
    }
    if (!patientId) {
      return undefined;
    }
    medplum
      .readResource('Patient', patientId)
      .then(setPatient)
      .catch(showErrorNotification);
    return undefined;
  }, [patientProp, patientId, medplum]);

  useEffect(() => {
    let cancelled = false;
    const resolveRequester = async (): Promise<void> => {
      const profile = medplum.getProfile() as Practitioner | PractitionerRole | undefined;
      if (!profile || cancelled) {
        return;
      }
      if (profile.resourceType === 'Practitioner') {
        setRequester(profile);
        return;
      }
      if (profile.resourceType === 'PractitionerRole' && profile.practitioner?.reference) {
        try {
          const resolved = await medplum.readReference(profile.practitioner);
          if (!cancelled && resolved.resourceType === 'Practitioner') {
            setRequester(resolved);
          }
        } catch (e) {
          showErrorNotification(e);
        }
      }
    };
    resolveRequester().catch(showErrorNotification);
    return (): void => {
      cancelled = true;
    };
  }, [medplum]);

  useEffect(() => {
    if (!termMedication) {
      setFormatMedications([]);
      setSelectedFormat(undefined);
      return undefined;
    }
    const rid = getRoutedMedIdFromMedication(termMedication);
    if (rid === undefined) {
      setFormatMedications([]);
      setSelectedFormat(termMedication);
      return undefined;
    }
    let cancelled = false;
    setLoadingFormats(true);
    searchMedications({ routedMedId: rid })
      .then((list) => {
        if (!cancelled) {
          const deduped = dedupeMedications(list);
          setFormatMedications(deduped);
          const pick = deduped[0] ?? termMedication;
          setSelectedFormat(pick);
          setSigIndex(0);
        }
      })
      .catch(showErrorNotification)
      .finally(() => {
        if (!cancelled) {
          setLoadingFormats(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [termMedication, searchMedications]);

  const sigOptions = useMemo(
    () => (selectedFormat ? parseScriptSureSigs(selectedFormat, qualifierMatcher) : []),
    [selectedFormat, qualifierMatcher]
  );

  const formulationSigChoices = useMemo(
    () => buildFormulationSigChoices(formatMedications, qualifierMatcher),
    [formatMedications, qualifierMatcher]
  );

  const selectedChoiceKey = useMemo(() => {
    if (!selectedFormat || formatMedications.length === 0) {
      return '';
    }
    const fIdx = formatMedications.indexOf(selectedFormat);
    if (fIdx < 0) {
      return '';
    }
    const si = sigOptions.length > 0 ? sigIndex : -1;
    return `${fIdx}:${si}`;
  }, [selectedFormat, formatMedications, sigOptions, sigIndex]);

  // Auto-sync the visible quantity and quantity qualifier to the currently selected sig.
  useEffect(() => {
    const s = sigOptions[sigIndex];
    if (s && s.quantity > 0) {
      setQuantity(s.quantity);
    }
    if (s) {
      setManualQtyQualifier(s.quantityQualifier);
    }
  }, [sigOptions, sigIndex]);

  // Pre-fill days supply from the currently visible sig + dispense quantity.
  // We stop overriding once the user edits the days-supply field manually so the
  // auto-calc behaves as a hint, not a lock.
  const activeSigText = sigOptions[sigIndex]?.sigLine ?? freeSig;
  useEffect(() => {
    if (daysSupplyTouched) {
      return;
    }
    const days = inferDaysSupplyFromSig(activeSigText, quantity);
    if (days && days !== daysSupply) {
      setDaysSupply(days);
    }
  }, [activeSigText, quantity, daysSupplyTouched, daysSupply]);

  const loadMedicationOptions = useCallback(
    async (input: string, signal: AbortSignal): Promise<Medication[]> => {
      const t = input.trim();
      if (t.length < 2) {
        return [];
      }
      const list = await searchMedications({ term: t });
      if (signal.aborted) {
        return [];
      }
      return dedupeMedications(list);
    },
    [searchMedications]
  );

  const selectedSigText = useMemo(() => {
    if (sigOptions.length > 0 && sigOptions[sigIndex]) {
      return sigOptions[sigIndex].sigLine;
    }
    return freeSig;
  }, [sigOptions, sigIndex, freeSig]);

  const submitSingle = async (): Promise<void> => {
    if (!patient?.id || !requester || !selectedFormat) {
      showErrorNotification('Patient, requester, and medication are required');
      return;
    }
    const sigLine3 = selectedSigText.trim() || 'Take as directed';
    const q = sigOptions.length > 0 && sigOptions[sigIndex] ? sigOptions[sigIndex].quantity : quantity;
    const qtyUnit =
      sigOptions.length > 0 && sigOptions[sigIndex]
        ? sigOptions[sigIndex].quantityQualifier
        : manualQtyQualifier;

    setSubmitting(true);
    try {
      const mr = await medplum.createResource<MedicationRequest>({
        resourceType: 'MedicationRequest',
        status: 'draft',
        intent: 'order',
        subject: createReference(patient),
        requester: createReference(requester),
        authoredOn: writtenDateYmd,
        medicationCodeableConcept: medicationToCodeableConcept(selectedFormat),
        substitution: { allowedBoolean: useSubstitution },
        reasonReference: primaryCondition?.id ? [{ reference: `Condition/${primaryCondition.id}` }] : undefined,
        insurance: coverage?.id ? [{ reference: `Coverage/${coverage.id}` }] : undefined,
        dosageInstruction: [
          {
            text: sigLine3,
            patientInstruction: patientInstruction.trim() || undefined,
          },
        ],
        note: notesPharmacist.trim() ? [{ text: notesPharmacist.trim() }] : undefined,
        dispenseRequest: {
          quantity: { value: q, unit: qtyUnit },
          numberOfRepeatsAllowed: refill,
          expectedSupplyDuration: {
            value: daysSupply,
            unit: 'days',
            system: 'http://unitsofmeasure.org',
            code: 'd',
          },
          validityPeriod: {
            start: writtenDateYmd,
            ...(fillDateYmd.trim() ? { end: fillDateYmd.trim() } : {}),
          },
          performer: pharmacyOrg?.id ? createReference(pharmacyOrg) : undefined,
        },
      });

      const res = await orderMedication({
        patientId: patient.id,
        medicationRequestId: mr.id,
        conditionIds: primaryCondition?.id ? [primaryCondition.id] : [],
        coverageId: coverage?.id,
        pharmacyOrganizationId: pharmacyOrg?.id,
        writtenDate: writtenDateYmd,
        fillDate: fillDateYmd.trim() || undefined,
      });

      onOrderComplete?.({ launchUrl: res.launchUrl, medicationRequestId: res.medicationRequestId });
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setSubmitting(false);
    }
  };

  const submitCompound = async (): Promise<void> => {
    if (!patient?.id) {
      showErrorNotification('Patient is required');
      return;
    }
    if (!requester) {
      showErrorNotification('Requester is required');
      return;
    }
    const drugs: MedicationOrderDrugInput[] = [];
    for (const line of compoundLines) {
      if (!line.formatMed) {
        showErrorNotification('Each compound line needs a selected formulation');
        return;
      }
      const sigs = parseScriptSureSigs(line.formatMed, qualifierMatcher);
      const sigLine3 = sigs[0]?.sigLine ?? 'Take as directed';
      drugs.push(
        medicationToOrderDrugInput(line.formatMed, {
          sigLine3,
          quantity: line.quantity,
          refill: line.refill,
          useSubstitution: line.useSubstitution,
          quantityQualifier: sigs[0]?.quantityQualifier,
        })
      );
    }
    if (drugs.length < 2) {
      showErrorNotification('Compound orders need at least two drug lines');
      return;
    }
    setSubmitting(true);
    try {
      const sigExtras = compoundPatientInstruction.trim();
      const drugsWithNotes = sigExtras
        ? drugs.map((d, i) =>
            i === 0
              ? {
                  ...d,
                  sigLine3: [d.sigLine3, sigExtras].filter(Boolean).join(' · '),
                }
              : d
          )
        : drugs;
      const res = await orderMedication({
        patientId: patient.id,
        combinationMed: true,
        drugs: drugsWithNotes,
        conditionIds: primaryCondition?.id ? [primaryCondition.id] : [],
        coverageId: coverage?.id,
        pharmacyOrganizationId: pharmacyOrg?.id,
        writtenDate: compoundWrittenYmd,
        fillDate: compoundFillYmd.trim() || undefined,
        durationDays: compoundDaysSupply,
        pharmacyNote: compoundNotesPharmacist.trim() || undefined,
      });
      onOrderComplete?.({ launchUrl: res.launchUrl, medicationRequestId: res.medicationRequestId });
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="md">
      <Panel>
        <Tabs value={activeTab} onChange={(v) => setActiveTab(v ?? 'single')}>
          <Tabs.List>
            <Tabs.Tab value="single">Single medication</Tabs.Tab>
            <Tabs.Tab value="compound">Compound</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="single" pt="md">
            <Stack gap="md">
              <Input.Wrapper label="Patient" required>
                <ResourceInput<Patient>
                  key={patient?.id ?? 'patient-input'}
                  resourceType="Patient"
                  name="patient"
                  defaultValue={patient}
                  onChange={setPatient}
                />
              </Input.Wrapper>

              <Input.Wrapper label="Requester" required>
                <ResourceInput<Practitioner>
                  key={requester?.id ?? 'requester-input'}
                  resourceType="Practitioner"
                  name="requester"
                  defaultValue={requester}
                  onChange={setRequester}
                />
              </Input.Wrapper>

              <div>
                <AsyncAutocomplete<Medication>
                  required
                  maxValues={1}
                  minInputLength={2}
                  label="Search medication"
                  placeholder="Type drug name"
                  loadOptions={loadMedicationOptions}
                  toOption={medicationSearchToOption}
                  itemComponent={MedicationSearchItem}
                  onChange={(items) => {
                    setTermMedication(items[0]);
                    setFreeSig('');
                  }}
                />
                {loadingFormats && <Text size="sm">Loading formulations…</Text>}
              </div>

              {formulationSigChoices.length > 0 && (
                <Radio.Group
                  label={`Formulation & directions (${formulationSigChoices.length})`}
                  description="Pick the formulation and pre-built sig in one step"
                  value={selectedChoiceKey}
                  onChange={(v) => {
                    const [fStr, sStr] = v.split(':');
                    const fIdx = parseInt(fStr, 10);
                    const sIdx = parseInt(sStr, 10);
                    const fm = formatMedications[fIdx];
                    if (fm) {
                      setSelectedFormat(fm);
                      setSigIndex(sIdx >= 0 ? sIdx : 0);
                    }
                  }}
                >
                  <ScrollArea.Autosize mah={320} mt="xs" type="auto" offsetScrollbars>
                    <Stack gap="xs" pr="sm">
                      {formulationSigChoices.map((choice) => (
                        <Radio
                          key={`${choice.formatIndex}:${choice.sigIndex}`}
                          value={`${choice.formatIndex}:${choice.sigIndex}`}
                          label={
                            <Stack gap={0}>
                              <Text size="sm" fw={500}>
                                {choice.formatLabel}
                              </Text>
                              {choice.sigLine && (
                                <Text size="xs" c="dimmed">
                                  {choice.sigLine}
                                  {choice.quantity > 0 ? ` · qty ${choice.quantity}` : ''}
                                </Text>
                              )}
                            </Stack>
                          }
                        />
                      ))}
                    </Stack>
                  </ScrollArea.Autosize>
                </Radio.Group>
              )}

              {selectedFormat && sigOptions.length === 0 && (
                <TextInput label="Sig (directions)" required value={freeSig} onChange={(e) => setFreeSig(e.currentTarget.value)} />
              )}

              <Group grow>
                <TextInput
                  type="date"
                  label="Written / start date"
                  value={writtenDateYmd}
                  onChange={(e) => setWrittenDateYmd(e.currentTarget.value)}
                />
                <TextInput
                  type="date"
                  label="Earliest fill (optional)"
                  value={fillDateYmd}
                  onChange={(e) => setFillDateYmd(e.currentTarget.value)}
                />
              </Group>

              <Group grow align="flex-start">
                <NumberInput
                  label="Days supply"
                  description="Auto-estimated from sig × quantity"
                  value={daysSupply}
                  onChange={(v) => {
                    setDaysSupplyTouched(true);
                    setDaysSupply(Number(v) || 0);
                  }}
                  min={1}
                />
                <NumberInput
                  label="Quantity to dispense"
                  description="Amount to send (e.g. tablets)"
                  value={quantity}
                  onChange={(v) => setQuantity(Number(v) || 0)}
                  min={0}
                />
                <NumberInput
                  label="Refills"
                  description="Number of refills allowed"
                  value={refill}
                  onChange={(v) => setRefill(Number(v) || 0)}
                  min={0}
                />
              </Group>

              <Select
                label="Quantity qualifier (dispense unit)"
                description="How the dispensed amount is counted (NCI potency unit)"
                data={qtyQualifierSelectData}
                value={manualQtyQualifier}
                onChange={(v) => setManualQtyQualifier(v ?? DEFAULT_QUANTITY_QUALIFIER)}
                searchable
              />

              <Textarea
                label="Notes to pharmacist"
                placeholder="Shown on the ScriptSure pending order"
                value={notesPharmacist}
                onChange={(e) => setNotesPharmacist(e.currentTarget.value)}
                minRows={2}
              />
              <Textarea
                label="Patient instructions (additional)"
                placeholder="Optional extra directions for the patient label"
                value={patientInstruction}
                onChange={(e) => setPatientInstruction(e.currentTarget.value)}
                minRows={2}
              />

              <Checkbox label="Allow substitution" checked={useSubstitution} onChange={(e) => setUseSubstitution(e.currentTarget.checked)} />

              <OptionalContextFields
                medplum={medplum}
                patient={patient}
                primaryCondition={primaryCondition}
                setPrimaryCondition={setPrimaryCondition}
                coverage={coverage}
                setCoverage={setCoverage}
                pharmacyOrg={pharmacyOrg}
                setPharmacyOrg={setPharmacyOrg}
              />

              <Button onClick={submitSingle} loading={submitting}>
                Prescribe
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="compound" pt="md">
            <Stack gap="md">
              <Input.Wrapper label="Patient" required>
                <ResourceInput<Patient>
                  key={patient?.id ?? 'patient-compound'}
                  resourceType="Patient"
                  name="patient-compound"
                  defaultValue={patient}
                  onChange={setPatient}
                />
              </Input.Wrapper>

              <ResourceInput<Practitioner>
                resourceType="Practitioner"
                name="requester-c"
                label="Requester"
                defaultValue={requester}
                onChange={setRequester}
              />

              <Group grow>
                <TextInput
                  type="date"
                  label="Written / start date"
                  value={compoundWrittenYmd}
                  onChange={(e) => setCompoundWrittenYmd(e.currentTarget.value)}
                />
                <TextInput
                  type="date"
                  label="Earliest fill (optional)"
                  value={compoundFillYmd}
                  onChange={(e) => setCompoundFillYmd(e.currentTarget.value)}
                />
              </Group>
              <NumberInput
                label="Days supply"
                description="Therapy length (days) for the compound order"
                value={compoundDaysSupply}
                onChange={(v) => setCompoundDaysSupply(Number(v) || 0)}
                min={1}
              />
              <Textarea
                label="Notes to pharmacist"
                value={compoundNotesPharmacist}
                onChange={(e) => setCompoundNotesPharmacist(e.currentTarget.value)}
                minRows={2}
              />
              <Textarea
                label="Patient instructions (additional)"
                description="Appended to the first drug line sig sent to ScriptSure"
                value={compoundPatientInstruction}
                onChange={(e) => setCompoundPatientInstruction(e.currentTarget.value)}
                minRows={2}
              />

              {compoundLines.map((line, idx) => (
                <CompoundLineEditor
                  key={line.id}
                  index={idx}
                  line={line}
                  searchMedications={searchMedications}
                  onChange={(next) => {
                    setCompoundLines((prev) => prev.map((l) => (l.id === line.id ? next : l)));
                  }}
                />
              ))}
              <Button
                variant="light"
                onClick={() =>
                  setCompoundLines((prev) => [
                    ...prev,
                    {
                      id: `line-${Date.now()}-${prev.length}`,
                      quantity: 30,
                      refill: 0,
                      useSubstitution: true,
                    },
                  ])
                }
              >
                Add drug line
              </Button>
              <OptionalContextFields
                medplum={medplum}
                patient={patient}
                primaryCondition={primaryCondition}
                setPrimaryCondition={setPrimaryCondition}
                coverage={coverage}
                setCoverage={setCoverage}
                pharmacyOrg={pharmacyOrg}
                setPharmacyOrg={setPharmacyOrg}
              />
              <Button onClick={submitCompound} loading={submitting}>
                Prescribe
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Panel>
    </Container>
  );
}

function coverageLabel(coverage: Coverage): string {
  const payor = coverage.payor?.find((p) => p.display)?.display;
  const plan = coverage.class?.find((c) => c.name)?.name;
  const memberId = coverage.subscriberId;
  const parts = [payor ?? 'Coverage', plan, memberId ? `#${memberId}` : undefined].filter(Boolean);
  return parts.join(' · ');
}

function OptionalContextFields(props: {
  medplum: MedplumClient;
  patient: Patient | undefined;
  primaryCondition: Condition | undefined;
  setPrimaryCondition: (c: Condition | undefined) => void;
  coverage: Coverage | undefined;
  setCoverage: (c: Coverage | undefined) => void;
  pharmacyOrg: Organization | undefined;
  setPharmacyOrg: (o: Organization | undefined) => void;
}): JSX.Element {
  const {
    medplum,
    patient,
    primaryCondition,
    setPrimaryCondition,
    coverage,
    setCoverage,
    pharmacyOrg,
    setPharmacyOrg,
  } = props;

  const [patientCoverages, setPatientCoverages] = useState<WithId<Coverage>[]>([]);
  const [preferredPharmacies, setPreferredPharmacies] = useState<{ org: WithId<Organization>; isPrimary: boolean }[]>(
    []
  );

  useEffect(() => {
    if (!patient?.id) {
      setPatientCoverages((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    let cancelled = false;
    medplum
      .searchResources('Coverage', `patient=Patient/${patient.id}&status=active&_count=50`)
      .then((rows) => {
        if (!cancelled) {
          setPatientCoverages(rows.filter((c): c is WithId<Coverage> => Boolean(c.id)));
        }
      })
      .catch((e) => {
        if (!cancelled) {
          showErrorNotification(e);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [medplum, patient]);

  useEffect(() => {
    if (!patient) {
      setPreferredPharmacies((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    const refs = getPreferredPharmaciesFromPatient(patient);
    if (refs.length === 0) {
      setPreferredPharmacies((prev) => (prev.length === 0 ? prev : []));
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      refs.map((p) =>
        medplum
          .readReference(p.organizationRef)
          .then((org) => (org.id ? { org, isPrimary: p.isPrimary } : undefined))
          .catch(() => undefined)
      )
    )
      .then((rows) => {
        if (cancelled) {
          return;
        }
        const filtered: { org: WithId<Organization>; isPrimary: boolean }[] = [];
        for (const row of rows) {
          if (row) {
            filtered.push(row);
          }
        }
        // Surface the primary pharmacy first.
        filtered.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
        setPreferredPharmacies(filtered);
      })
      .catch(showErrorNotification);
    return (): void => {
      cancelled = true;
    };
  }, [medplum, patient]);

  // Auto-select primary pharmacy when nothing is chosen yet.
  useEffect(() => {
    if (pharmacyOrg) {
      return;
    }
    const primary = preferredPharmacies.find((p) => p.isPrimary) ?? preferredPharmacies[0];
    if (primary) {
      setPharmacyOrg(primary.org);
    }
  }, [preferredPharmacies, pharmacyOrg, setPharmacyOrg]);

  // Auto-select the first active coverage when nothing is chosen yet.
  useEffect(() => {
    if (coverage) {
      return;
    }
    const first = patientCoverages[0];
    if (first) {
      setCoverage(first);
    }
  }, [patientCoverages, coverage, setCoverage]);

  const coverageOptions = useMemo(
    () =>
      patientCoverages
        .filter((c) => c.id)
        .map((c) => ({ value: getReferenceString(c), label: coverageLabel(c) })),
    [patientCoverages]
  );

  const pharmacyOptions = useMemo(
    () =>
      preferredPharmacies.map(({ org, isPrimary }) => ({
        value: getReferenceString(org),
        label: `${org.name ?? 'Pharmacy'}${isPrimary ? ' (primary)' : ''}`,
      })),
    [preferredPharmacies]
  );

  return (
    <>
      <Divider label="Optional context" labelPosition="center" />
      <ResourceInput<Condition>
        resourceType="Condition"
        name="condition"
        label="Condition (diagnosis)"
        defaultValue={primaryCondition}
        onChange={setPrimaryCondition}
        searchCriteria={patient ? { patient: `Patient/${patient.id}` } : undefined}
      />
      <Select
        label="Coverage"
        description={
          patientCoverages.length === 0
            ? 'No active coverages on file for this patient'
            : "Select from the patient's active plans"
        }
        placeholder={patientCoverages.length === 0 ? 'No coverages found' : 'Select coverage'}
        data={coverageOptions}
        disabled={patientCoverages.length === 0}
        value={coverage ? getReferenceString(coverage) : null}
        onChange={(v) => {
          const next = patientCoverages.find((c) => getReferenceString(c) === v);
          setCoverage(next);
        }}
        clearable
      />
      <Select
        label="Pharmacy"
        description={
          preferredPharmacies.length === 0
            ? 'No preferred pharmacies on file for this patient'
            : "Select from the patient's preferred pharmacies"
        }
        placeholder={preferredPharmacies.length === 0 ? 'No preferred pharmacies' : 'Select pharmacy'}
        data={pharmacyOptions}
        disabled={preferredPharmacies.length === 0}
        value={pharmacyOrg ? getReferenceString(pharmacyOrg) : null}
        onChange={(v) => {
          const next = preferredPharmacies.find((p) => getReferenceString(p.org) === v)?.org;
          setPharmacyOrg(next);
        }}
        clearable
      />
    </>
  );
}

interface CompoundLineState {
  id: string;
  termMed?: Medication;
  formatMed?: Medication;
  quantity: number;
  refill: number;
  useSubstitution: boolean;
}

function CompoundLineEditor(props: {
  index: number;
  line: CompoundLineState;
  searchMedications: (p: { term?: string; routedMedId?: number }) => Promise<Medication[]>;
  onChange: (line: CompoundLineState) => void;
}): JSX.Element {
  const { index, line, searchMedications, onChange } = props;
  const [formats, setFormats] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOpts = useCallback(
    async (input: string, signal: AbortSignal): Promise<Medication[]> => {
      const t = input.trim();
      if (t.length < 2) {
        return [];
      }
      const list = await searchMedications({ term: t });
      if (signal.aborted) {
        return [];
      }
      return dedupeMedications(list);
    },
    [searchMedications]
  );

  const handleMedicationChange = async (m: Medication | undefined): Promise<void> => {
    if (!m) {
      setFormats([]);
      onChange({ ...line, termMed: undefined, formatMed: undefined });
      return;
    }
    const rid = getRoutedMedIdFromMedication(m);
    if (rid === undefined) {
      setFormats([]);
      onChange({ ...line, termMed: m, formatMed: m });
      return;
    }
    setLoading(true);
    try {
      const list = dedupeMedications(await searchMedications({ routedMedId: rid }));
      setFormats(list);
      onChange({ ...line, termMed: m, formatMed: list[0] ?? m });
    } catch (e) {
      showErrorNotification(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaperWithTitle title={`Drug line ${index + 1}`}>
      <Stack gap="sm">
        <AsyncAutocomplete<Medication>
          label="Search"
          placeholder="Drug name"
          maxValues={1}
          minInputLength={2}
          loadOptions={loadOpts}
          toOption={medicationSearchToOption}
          defaultValue={line.termMed}
          onChange={(items) => {
            handleMedicationChange(items[0]).catch(showErrorNotification);
          }}
        />
        {loading && <Text size="xs">Loading formulations…</Text>}
        {formats.length > 1 && (
          <Radio.Group
            label="Formulation"
            value={line.formatMed ? String(formats.indexOf(line.formatMed)) : ''}
            onChange={(v) => {
              const fm = formats[parseInt(v, 10)];
              onChange({ ...line, formatMed: fm });
            }}
          >
            <Stack gap={4}>
              {formats.map((fm, i) => (
                <Radio key={i} value={String(i)} label={fm.code?.text ?? `Option ${i + 1}`} />
              ))}
            </Stack>
          </Radio.Group>
        )}
        <Group grow>
          <NumberInput
            label="Quantity"
            value={line.quantity}
            onChange={(v) => onChange({ ...line, quantity: Number(v) || 0 })}
            min={0}
          />
          <NumberInput
            label="Refills"
            value={line.refill}
            onChange={(v) => onChange({ ...line, refill: Number(v) || 0 })}
            min={0}
          />
        </Group>
        <Checkbox
          label="Allow substitution"
          checked={line.useSubstitution}
          onChange={(e) => onChange({ ...line, useSubstitution: e.currentTarget.checked })}
        />
      </Stack>
    </PaperWithTitle>
  );
}

function PaperWithTitle(props: { title: string; children: ReactNode }): JSX.Element {
  const { title, children } = props;
  return (
    <Stack gap="xs">
      <Text fw={600}>{title}</Text>
      {children}
    </Stack>
  );
}
