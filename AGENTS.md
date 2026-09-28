# AGENTS.md — conventions for every engineer and agent in this repo

## The one rule that matters

**Tool code never touches the database directly.** Nothing under `src/apps/`
may import the Prisma client or `src/platform/db` (enforced by an ESLint
`no-restricted-imports` rule — CI fails otherwise). Tools only ever receive a
transaction handle (`Tx`) from the platform's wrappers, which run
`authorize()` first and write the audit event(s) in the same transaction:

```ts
await withAuthorizedTx(user, "mytool:do-thing", async (tx) => {
  // writes via tx only
  return { result, audit: { action, entityType, entityId, before, after, reason } };
});
```

`src/platform/` is CODEOWNED — platform changes need platform-owner review.

## Layout

```
prisma/schema/        one .prisma file per tool + base.prisma (User, AuditEvent, ApprovalRequest)
prisma/seed.ts        orchestrator — seeds users, then calls each tool's ToolDef.seed
src/platform/         the paved road (see below)
src/apps/<tool>/      one folder per tool — everything the tool owns
src/app/              Next.js routes; thin, call platform wrappers + services
tests/                platform invariant tests
```

Platform modules (`src/platform/`):

| Module | What it gives you |
| --- | --- |
| `db.ts` | Extended client (`db`), `Tx` handle, append-only AuditEvent enforcement |
| `auth/` | `IdentityProvider` interface, dev provider, Entra stub, session cookie |
| `authz/` | `authorize(user, permission)` — the single check, default deny |
| `tx.ts` | `withAuthorizedTx` (authorize → tx → audit, atomically), `withAuthorizedRead` |
| `approvals.ts` | maker-checker: `submitForApproval`, `decideApproval`, `listApprovableRequests` |
| `approval-actions.ts` | registry mapping `actionKey` → the function an approval executes |
| `pii.ts` | `maskPii` — masks a DTO's `pii` sub-object without `pii:read` |
| `registry.ts` | the tool registry — the ONE place tools are wired in |
| `ui/` | AppShell, AppSwitcher, DataTable, DetailDrawer, shadcn primitives |

## Adding a tool

Copy `src/apps/kyc/` — it is the reference implementation:

1. `mkdir src/apps/<tool>` and copy the KYC structure: `tool.ts`,
   `permissions.ts`, `types.ts`, `source.ts`, `service.ts`, `seed.ts`,
   `actions.ts`, `queue-view.tsx`, `<tool>.test.ts`.
2. Create `prisma/schema/<tool>.prisma` (Postgres-safe: no `Json`, no enums —
   use `String` + TS unions + Zod).
3. Add ONE line to `src/platform/registry.ts` (`tools` array) plus its import.
4. Mount pages under `src/app/(app)/<tool>/`. Gate every page and action with
   `authorize` / `withAuthorized*`. That's it — `db:reset` picks up the seed,
   the app switcher picks up visibility.

Because tools only meet through the registry and shared schema dir, several
tools can be built on separate branches without touching each other's files.

## Non-negotiables

- Every server action and route handler goes through a `withAuthorized*` wrapper
  (or an explicit `authorize()` + `requirePermission`) — never trust the client.
- Every mutation declares its audit spec; the platform writes it in the same
  transaction. If your change produces two logical changes, return two specs.
- PII columns are named `pii*` in the schema and grouped into `dto.pii` by the
  source layer so `maskPii` covers them. Revealing PII goes through a
  `pii.reveal` audited action, not a permissive read.
- Approval-worthy actions call `submitForApproval` instead of executing, and
  register the executable under `actionKey` in `<tool>/tool.ts` via
  `registerApprovalAction`.
- SQLite-friendly + Postgres-compatible schema (String for JSON and enums).
- No extra auth, state-management or ORM libraries.
