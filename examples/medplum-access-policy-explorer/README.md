<h1 align="center">Medplum Access Policy Explorer</h1>
<p align="center">See how several Medplum access policies combine for one project membership.</p>

A [ProjectMembership](https://www.medplum.com/docs/api/fhir/medplum/projectmembership) can reference several
[access policies](https://www.medplum.com/docs/access/access-policies). At login, the server merges them into one policy:

- Every policy's `resource` entries are concatenated, in membership order (`accessPolicy` first, then each `access` entry).
- For any resource and interaction, the **first** matching entry decides whether access is allowed, and it alone supplies
  `hiddenFields`, `readonlyFields` and `writeConstraint`.
- Searches OR together the criteria of every entry that allows `search`; one entry without criteria removes the filter.
- The last policy with a `compartment` sets the compartment.
- The server then adds its own rules: default read access to `SearchParameter`/`StructureDefinition`, project admin rules,
  and a read-only `Bot.system`.

This app loads a membership's policies (or lets you pick and paste policies to try), merges them the same way, and shows:

- **Merged policy**: the combined entry list, where each entry came from, unsubstituted `%variables`, conflicting
  compartments, and entries that can never be selected. Switch to **JSON** to see the merged result as a single
  AccessPolicy.
- **Matrix**: resource types × interactions, marking full, conditional and denied access, and cells where matching
  entries disagree on field rules.
- **Which entry wins**: for a resource type and interaction, which entry the server picks and why every other entry was
  skipped. Load or paste a sample resource to evaluate criteria against it.
- **Field surprises**: hidden fields, read-only fields and write constraints that are skipped because an earlier entry
  matches first.
- **Search scope**: the filter applied to searches for each resource type, including criteria the server rejects.

Each policy card has **Show JSON**, which shows the policy's raw JSON. You can edit it and apply the edits to see how
the result changes. Edits stay in the browser and are never saved to the server; **Revert edits** restores the loaded
policy.

The merge logic in `src/lib/merge.ts` mirrors `packages/server/src/fhir/accesspolicy.ts`. It does not model SMART
scopes or super admin projects. Criteria are evaluated in the browser with `matchesSearchRequest` from `@medplum/core`,
which does not support chained or `_has` parameters; entries using them are marked "cannot evaluate".

Two deliberate differences from the server:

- With no profile set, the explorer leaves `%profile` and `%patient` unfilled and warns about them. The server would
  substitute the string `undefined`.
- Percent-encoded bytes such as `%C3` in criteria values are not reported as unfilled variables.

### Getting Started

Sign in as a project admin, so the app can read `AccessPolicy` and `ProjectMembership` resources.

If you want to change any environment variables from the defaults, copy the `.env.defaults` file to `.env`

```bash
cp .env.defaults .env
```

Next, install the dependencies

```bash
npm install
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

Run the unit tests for the merge and analysis logic with

```bash
npm test
```
