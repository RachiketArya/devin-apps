# Playbook: New internal tool on the paved road

Use this playbook (in Devin, or any AI agent that reads the repo) to add a new
internal tool. It exists so that every tool lands with the same shape, the
same safety guarantees, and a diff that only touches its own folder.

The agent's job is to fill in the shape; **your** job is to write a good spec
(see "Required from the spec author" below). The better the spec, the better
the tool — vague specs get the restrictive defaults listed under Advice.

## Required from the spec author

A short spec covering:

- **Who** uses the tool — which roles, and what each can do.
- **Data** — entities and fields, and which fields are PII.
- **Actions** — every mutation the tool offers.
- **Approvals** — which actions need a second person, and the threshold/rule.
- **External systems** — anything the tool would call in production (payment
  processor, KYC vendor, flag service…). These always go behind a small
  interface with a mock implementation.

## Procedure

1. Read `AGENTS.md`, `src/platform/` and `src/apps/kyc/` (the reference tool)
   before writing code. `src/apps/refunds/` is a good second example.
2. Create the tool in `src/apps/<tool>/` following the KYC structure: its own
   permissions and role grants, seed data, Prisma schema file in
   `prisma/schema/`, service functions, UI and tests. Register it with one
   line in the tool registry.
3. Model the data and seed realistic fake records. Tag PII fields.
4. Put any external system (payment processor, KYC vendor, flag service)
   behind a small interface in `src/apps/<tool>/adapters/` with a mock
   implementation.
5. Build the list view with the shared DataTable, the detail drawer and forms
   from the shared kit.
6. Implement every action as a service function behind `authorize()` and the
   audit helper, called from a server action. Route approval-gated actions
   through maker-checker.
7. Write tests proving, for each permissioned or approval-gated action, that
   a role without the permission is denied, that the requester can't approve
   their own request, and that an audit event is written.
8. Run lint, typecheck and tests. Then write down the expected result of each
   main flow, run the flows in the browser as each role via the dev sign-in
   route, and record pass/fail with labelled screenshots.
9. Rebase on main, then open one PR titled `feat(<tool>): ...`. The
   description has the spec, what you built, the permissions and approval
   rules added, the tests added, the test plan with pass/fail and
   screenshots, and assumptions.

## Specifications

- CI is green.
- The tool appears in the app switcher only for roles that have access.
- Every mutation in the tool shows up in `/audit`, and approval-gated actions
  show up in `/approvals`.
- Outside `src/apps/<tool>/` and its schema file, the diff is one registry
  line (plus the route mount under `src/app/(app)/<tool>/` and any platform
  change explained in the PR).

## Advice

- If the spec is vague about permissions, choose the more restrictive option
  and say so in the PR.
- If the tool genuinely needs a new platform capability, add it in a separate
  commit with tests and explain why.

## Forbidden actions

- Don't import the database client anywhere under `src/apps/`; use the
  platform wrappers. Don't disable or work around the lint rule that enforces
  this.
- Don't write your own auth, permission, approval or audit logic.
- Don't modify another tool's code.
- Don't use real personal data or any real credentials.
- Don't weaken, skip or delete a test to make CI pass.
- Don't add dependencies without explaining why in the PR.

---

## Example prompts

These are complete specs in the format above — copy the shape, change the
domain. The first one built the refunds dashboard in this repo; the second is
a ready-to-run next tool.

### Feature-flag admin (example)

> Tool: Feature-flag admin, in `src/apps/flags/`.
>
> **Who:** engineers create flags and change dev and staging; any prod change
> needs approval by a different engineer or an admin; analyst is read-only.
>
> **Data:** FeatureFlag with key (unique, kebab-case), description, owner
> team, and per environment (dev, staging, prod): enabled + rollout
> percentage 0–100. Seed ~15 flags.
>
> **Actions:** create a flag; toggle it or change its rollout per
> environment; prod changes go through maker-checker. Each flag's detail
> drawer shows its change history from the audit log.
>
> **Storage:** this tool is an admin panel, not a flag engine. Put flag reads
> and writes behind a `FlagStore` interface with a local (Prisma)
> implementation, so in production it can point at the company's real flag
> service. Don't build flag evaluation or an SDK.

### Refunds dashboard (as built in `src/apps/refunds/`)

> Tool: Refunds dashboard, in `src/apps/refunds/`.
>
> **Who:** finance_ops create and approve refunds; analyst is read-only;
> admin sees everything.
>
> **Data:** RefundRequest with customer name (PII), customer email (PII),
> original transaction ID, card last 4 only (never store or display a full
> card number), amount, currency, reason code, status (requested,
> pending_approval, approved, rejected, paid), requested by, approved by,
> timestamps. Seed ~40 fake requests across 3 currencies.
>
> **Actions:** create a refund request; refunds over USD 500 (use a fixed
> demo rate table for other currencies) need approval by a different
> finance_ops user; reject with a reason; mark as paid through a
> `PaymentsGateway` interface with a mock implementation (no real payment
> call).
>
> **Top of the page:** 3 KPI tiles (open requests, total pending approval in
> USD, approved today).
