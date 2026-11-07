---
sidebar_position: 3
tags:
  - labs
  - react
  - LabOrdersPanelView
  - integration
keywords:
  - LabOrdersPanelView
  - lab orders panel
  - partner integration
  - without Medplum client
  - DiagnosticReport
  - ServiceRequest
---

# Lab Orders Panel — Partner Integration

This guide is for applications that **do not use `MedplumClient`**. Every component listed below renders purely from props — no FHIR fetching happens inside. Assemble the data against your own backend and hand it in.

## The tree

```
LabOrdersPanelView
├── renderItem(item, selected)
│   ├── LabResultListItemView  (DiagnosticReport rows)
│   └── LabListItemView        (ServiceRequest rows)
└── renderDetail(item)
    └── LabDetailPaneView
        ├── renderOrder(order, selectedReport)
        │   └── LabOrderDetailsView
        └── renderResult(result)
            └── LabResultDetailsView
                └── LabReportContentView
                    └── DiagnosticReportDisplayView
```

Every box above is a client-free View. Nothing in this subtree calls your backend; you fetch, then render.

## Top level — `LabOrdersPanelView`

```ts
interface LabOrdersPanelViewProps {
  items: (ServiceRequest | DiagnosticReport)[];  // current page you searched
  total: number;                                  // total matching rows across pages
  loading: boolean;                               // your search is in flight
  search: SearchRequest;                          // normalized search (filters, sort, count, offset)
  activeTab: 'open' | 'completed' | 'revoked';
  selectedId: string | undefined;                 // drive this from your URL
  selected: ServiceRequest | DiagnosticReport | undefined;
  onChange(next: SearchRequest): void;            // fires on page change — reflect in the URL
  completedUri: string;                           // where the Completed tab pill links to
  openUri: string;
  revokedUri: string;
  renderTabLink(uri, linkProps): ReactNode;       // spread linkProps onto your <Link>
  renderItem(item, selected): ReactNode;          // wrap in your <Link>, return a *ListItemView
  renderDetail(item): ReactNode;                  // return a LabDetailPaneView
  onOrder?(): void;                               // optional "Order Labs" action
}
```

### What you fetch

- **`items`** — the panel does not care how:
  - **Open**: `ServiceRequest?subject=Patient/{id}&based-on:missing=true&status=active,draft,on-hold`
  - **Revoked**: `ServiceRequest?subject=Patient/{id}&based-on:missing=true&status=revoked`
  - **Completed**: `DiagnosticReport?subject=Patient/{id}&status=final,corrected,amended,preliminary,partial`
- **`total`** — the bundle's total count (use `_total=accurate` or your API's equivalent so paging is correct).
- **`selected`** — usually one of `items`. If the selection isn't on the current page (e.g. deep-linked), read that resource separately.

## List rows

### `LabResultListItemView` (DiagnosticReport rows)

```ts
interface LabResultListItemViewProps {
  report: DiagnosticReport;
  selected: boolean;
  performer?: Practitioner | Organization;  // resolve report.performer[0]
}
```

### `LabListItemView` (ServiceRequest rows)

```ts
interface LabListItemViewProps {
  item: ServiceRequest;
  selected: boolean;
  activeTab: 'open' | 'completed';
  requester?: Practitioner;                 // resolve item.requester
}
```

Resolve every row's person in **one batch**, not per-row. Build a `Map<referenceString, Practitioner | Organization>` once per page, then look each row up in `renderItem`.

## Detail pane — `LabDetailPaneView`

```ts
interface LabDetailPaneViewProps {
  item: ServiceRequest | DiagnosticReport;
  order?: ServiceRequest;                   // see below
  loading?: boolean;                         // true while you're resolving `order`
  renderOrder(order, selectedReport): ReactNode;   // return a LabOrderDetailsView
  renderResult(result): ReactNode;                 // return a LabResultDetailsView
}
```

### Resolving `order`

- If `item.resourceType === 'ServiceRequest'`, pass `item` itself.
- If `item.resourceType === 'DiagnosticReport'`, find a `basedOn[]` entry that references a `ServiceRequest` and read it. If none, leave `order` undefined and the pane will fall through to `renderResult` — the report has no order.

When `item` is a `DiagnosticReport`, `renderOrder` receives a `selectedReport: Reference<DiagnosticReport>` for `item`; use it to drive the default tab.

## Order details — `LabOrderDetailsView`

```ts
interface LabOrderDetailsViewProps {
  order: ServiceRequest;

  // People
  patient?: Patient;                        // resolve order.subject
  requester?: Practitioner;                 // resolve order.requester

  // The report shown in the Report tab
  report?: DiagnosticReport;
  reportLoading?: boolean;                  // true while you're resolving `report`
  reportAttachments?: Attachment[];         // see "Report attachments"
  reportResources?: Resource[];             // see "Report resources (observations)"

  // Order-level documents
  requisitionDocuments?: DocumentReference[];
  requisitionDocumentsLoading?: boolean;
  specimenLabelDocuments?: DocumentReference[];
  specimenLabelDocumentsLoading?: boolean;

  // Order-entry answers
  questionnaireResponse?: QuestionnaireResponse;

  // UI
  defaultTab?: 'report' | 'progress' | 'order';
  onRevoke?(): void;                        // PATCH ServiceRequest.status to 'revoked' and reflect
  onResume?(): void;                        // resume a draft order (your flow)
  renderLink?: RenderResourceLink;          // renders cross-references as <Link>s; default: plain text
}
```

### What you fetch

- **`report`** — if the caller selected a specific one (e.g. from the Completed list), read it. Otherwise find the order's latest:
  `DiagnosticReport?based-on=ServiceRequest/{order.id}&_sort=-_lastUpdated&_count=1`.
- **`requisitionDocuments`** — look for the Health Gorilla requisition identifier (either `order.requisition.value` when `order.requisition.system` is `https://www.healthgorilla.com`, or an `order.identifier[]` entry under that system). Then:
  `DocumentReference?category=LabOrderRequisition&identifier=https://www.healthgorilla.com|{id}&_sort=-_lastUpdated`.
- **`specimenLabelDocuments`** — same identifier walk, with `category=SpecimenLabel`.
- **`questionnaireResponse`** — read the `supportingInfo[]` entry that points at a `QuestionnaireResponse`. For Health Gorilla orders that carry none, fall back to a sibling `ServiceRequest` for the same subject + code that lists this order under `basedOn` and does carry one.
- **`onRevoke`** — `PATCH /ServiceRequest/{id}` with `[{op:'replace', path:'/status', value:'revoked'}]`, then update the `order` you hand back in.

## Result details — `LabResultDetailsView`

Rendered when the item is a `DiagnosticReport` without an order.

```ts
interface LabResultDetailsViewProps {
  result: DiagnosticReport;
  attachments?: Attachment[];               // see "Report attachments"
  resources?: Resource[];                   // see "Report resources (observations)"
  renderLink?: RenderResourceLink;
}
```

## Report content — `LabReportContentView`

Used inside both result and order views; include it directly if you need just the body (lab PDFs + observation table).

```ts
interface LabReportContentViewProps {
  report: DiagnosticReport;
  attachments?: Attachment[];               // see "Report attachments"
  resources?: Resource[];                   // see "Report resources (observations)"
  renderLink?: RenderResourceLink;
}
```

## Report attachments

The "Lab Document" section renders every attachment you pass. Assemble from two sources:

1. **`report.presentedForm[]`** — each entry is an `Attachment`. If `attachment.url` starts with `DocumentReference/`, read that DocumentReference and use its `content[]` entry whose `attachment.contentType` matches (or `content[0]` as fallback); keep the original `title`. Otherwise use the entry as-is.
2. **`report.result[]`** — for each `Observation` reference, read the Observation, walk `hasMember[]` recursively, and for each visited Observation read every `derivedFrom[]` entry that points at `DocumentReference/…` and keep its `content[0].attachment`.

Then **de-dupe by `attachment.url`** (Health Gorilla often folds the same lab-branded PDF into both `presentedForm` and `derivedFrom`). Attachments without a `url` always render.

Omit or pass `[]` → the "Lab Document" section is hidden.

## Report resources (observations)

Observation rows are looked up by **reference string** in this flat array. Resolve every reference the report cites:

- `report.subject`
- `report.performer[]`
- `report.specimen[]`
- `report.resultsInterpreter[]`
- `report.basedOn[0].requester` (the ordering practitioner, resolved indirectly via the order)
- Every `report.result[]` reference, walked **recursively** through `Observation.hasMember[]` down to the leaves

Return a flat `Resource[]` — mostly `Observation`s for a lab report. The View looks each reference up by `ResourceType/id`, or by `#id` against `report.contained` for inline resources. **A row the lookup can't resolve is hidden** — if you omit `resources`, no observation rows appear. Supply it for every selected report.

## Links

Every View that renders cross-references takes an optional `renderLink(target, children) => ReactNode`. Wire it to your router's `<Link>`. Omitted → references render as plain text. Same for `renderTabLink` on `LabOrdersPanelView`.

## Putting it together

```tsx
function MyLabPanel({
  patientId,
  activeTab,
  search,
  selectedId,
  onSearchChange,
}: {
  patientId: string;
  activeTab: 'open' | 'completed' | 'revoked';
  search: SearchRequest;
  selectedId?: string;
  onSearchChange: (next: SearchRequest) => void;      // write to URL
}) {
  const { items, total, loading } = useMyLabSearch(patientId, activeTab, search);
  const selected = useMyResolveSelected(selectedId, items);
  const people = useMyBatchResolvePeople(items);                         // Map<ref, Practitioner | Organization>
  const { order, loading: orderLoading } = useMyResolveOrder(selected);  // ServiceRequest | undefined
  const orderData = useMyOrderDetails(order, selectedReportRefOf(selected)); // patient, requester, report, …
  const resultData = useMyResultDetails(
    !orderLoading && !order && selected?.resourceType === 'DiagnosticReport' ? selected : undefined
  );

  return (
    <LabOrdersPanelView
      items={items}
      total={total}
      loading={loading}
      search={search}
      activeTab={activeTab}
      selectedId={selectedId}
      selected={selected}
      onChange={onSearchChange}
      completedUri="/labs/completed"
      openUri="/labs/open"
      revokedUri="/labs/revoked"
      renderTabLink={(uri, props) => <MyRouterLink to={uri} {...props} />}
      renderItem={(item, isSelected) => (
        <MyRouterLink to={myItemUri(item)}>
          {item.resourceType === 'DiagnosticReport' ? (
            <LabResultListItemView
              report={item}
              selected={isSelected}
              performer={
                people.get(item.performer?.[0]?.reference ?? '') as Practitioner | Organization | undefined
              }
            />
          ) : (
            <LabListItemView
              item={item}
              selected={isSelected}
              activeTab={activeTab === 'completed' ? 'completed' : 'open'}
              requester={people.get(item.requester?.reference ?? '') as Practitioner | undefined}
            />
          )}
        </MyRouterLink>
      )}
      renderDetail={(item) => (
        <LabDetailPaneView
          item={item}
          order={order}
          loading={orderLoading}
          renderOrder={(current, selectedReport) => (
            <LabOrderDetailsView
              order={current}
              patient={orderData.patient}
              requester={orderData.requester}
              report={orderData.report}
              reportLoading={orderData.reportLoading}
              reportAttachments={orderData.reportAttachments}
              reportResources={orderData.reportResources}
              requisitionDocuments={orderData.requisitionDocuments}
              requisitionDocumentsLoading={orderData.requisitionDocumentsLoading}
              specimenLabelDocuments={orderData.specimenLabelDocuments}
              specimenLabelDocumentsLoading={orderData.specimenLabelDocumentsLoading}
              questionnaireResponse={orderData.questionnaireResponse}
              defaultTab={selectedReport ? 'report' : undefined}
              onRevoke={() => myRevokeOrder(current.id)}
              renderLink={(to, children) => <MyRouterLink to={to}>{children}</MyRouterLink>}
            />
          )}
          renderResult={(result) => (
            <LabResultDetailsView
              result={result}
              attachments={resultData.attachments}
              resources={resultData.resources}
              renderLink={(to, children) => <MyRouterLink to={to}>{children}</MyRouterLink>}
            />
          )}
        />
      )}
    />
  );
}
```

Everything inside your `useMy*` boundary is yours — Suspense, React Query, Redux, raw fetch, GraphQL — whatever you already use. The Views don't care.
