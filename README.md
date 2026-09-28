# devin-apps — the paved road for internal tools

A proof of concept that a fintech's internal tools (today on Power Apps) can be
built and owned as code. Identity, permissions, approvals and audit are
written once in `src/platform/`; each tool lives in `src/apps/<tool>/` and is
small, consistent and safe by construction — tool code *cannot* reach the
database except through the platform's authorized, audited wrappers.

Two tools ride the road today: the **KYC review queue** (`src/apps/kyc/`,
the reference implementation) and the **refunds dashboard**
(`src/apps/refunds/`). To add your own, see [Adding a new tool](#adding-a-new-tool).

## Setup

```bash
cp .env.example .env  # dev defaults; never committed
pnpm install          # also runs prisma generate
pnpm db:reset         # prisma db push --force-reset + seed
pnpm dev              # http://localhost:3000
```

Stack: Next.js (App Router) · TypeScript strict · Prisma · SQLite dev /
Postgres prod · Tailwind + shadcn/ui · Zod · Vitest · pnpm.

## Seeded users (one per role)

Sign in at `/sign-in` (dev provider — no passwords anywhere). For automated
checks there is a one-step route: `/dev/sign-in?email=<email>&next=<path>`.

| Email | Role | Can do |
| --- | --- | --- |
| analyst@dev.local | analyst | claim/decide/escalate KYC cases, reveal PII (audited), read-only refunds |
| senior@dev.local | senior_analyst | same + approve high-risk requests in /approvals |
| finance@dev.local | finance_ops | create/approve/reject/pay refunds |
| finance2@dev.local | finance_ops | second maker/checker (seeded by the refunds tool) |
| engineer@dev.local | engineer | no tool access — demonstrates default deny |
| admin@dev.local | admin | /audit page, `pii:read` (PII always unmasked) |

## What's in the platform

- **Identity** — `IdentityProvider` interface; dev provider (signed cookie, one
  seeded user per role) + `EntraIdentityProvider` stub documenting the
  OIDC/`x-ms-client-principal` switch. `IDENTITY_PROVIDER` env selects it.
  Production refuses to boot with the dev provider or the default
  `AUTH_SECRET` (`src/platform/env.ts` via `src/instrumentation.ts`).
- **Authorization** — `authorize(user, permission)`, permission→roles map
  merged from platform + every registered tool. **Default deny.**
- **Audit** — append-only `AuditEvent` written in the same transaction as every
  mutation. The Prisma client extension rejects update/delete/upsert on it;
  in Postgres, revoke UPDATE/DELETE on the table from the app's DB role too.
  `/audit` (admin-only) has actor/action/entity filters.
- **Maker-checker** — `submitForApproval` inside a tx creates a pending
  `ApprovalRequest`; a different user with the request's approver permission
  approves/rejects in `/approvals`; on approval the registered action runs in
  the same transaction. The requester can never decide their own request.
- **PII** — `pii*` columns → `dto.pii` → `maskPii` server-side without
  `pii:read`. Reveal is an explicit, audited action (`pii:reveal`).
- **UI kit** — AppShell + AppSwitcher (permission-filtered), DataTable
  (sort/filter/paginate), DetailDrawer, shadcn primitives, Zod-validated forms.
- **Parallel-work layout** — a tool = its folder + its `prisma/schema/<tool>.prisma`
  file + one line in `src/platform/registry.ts`. `prisma db push` (no
  migrations in this PoC).
- **Bypass prevention** — ESLint `no-restricted-imports` forbids `src/apps/**`
  from importing the db client; `src/platform/` is CODEOWNED.

## KYC queue

~30 seeded cases (individuals + businesses), risk 0–100, statuses
new → in_review → escalated/approved/rejected, 1–3 documents each. Analysts
claim, note, approve/reject with a reason code, or escalate to senior_analyst.
Approving a case with risk ≥ 70 creates a maker-checker request instead —
senior_analyst decides in `/approvals`. Case data sits behind `KycCaseSource`
(`src/apps/kyc/source.ts`) — swap the Prisma implementation for a client over
the real KYC system without touching services.

## Refunds dashboard

40 seeded refund requests across USD/EUR/GBP. finance_ops creates refunds,
approves small ones, rejects with a reason, and marks approved ones paid
through a mocked `PaymentsGateway` (`src/apps/refunds/adapters/`). Creating a
refund over USD 500 (fixed demo FX table) opens a maker-checker request — a
*different* finance_ops user decides it in `/approvals`. KPI tiles (open
requests, USD pending approval, approved today) sit above the queue.

## Adding a new tool

The intended workflow — how both existing tools were built — is: write a
short spec, hand it to an AI agent (Devin or anything that reads the repo)
together with the playbook in [`docs/new-tool-playbook.md`](docs/new-tool-playbook.md),
and review the PR it opens.

A spec is five lines of prose, no more:

- **Who** uses it — roles and what each can do.
- **Data** — entities, fields, which fields are PII, seed volume.
- **Actions** — every mutation, and which ones need a second person
  (with the threshold/rule).
- **External systems** — anything it would call in production (these become
  mocked adapters behind an interface).
- **UI** — the list view plus anything special (KPI tiles, history…).

The playbook turns that spec into a tool that can't bypass the platform:
its own `src/apps/<tool>/` folder, `prisma/schema/<tool>.prisma`, one line in
the registry, permission-gated and audited service functions, tests, and a
browser-checked test plan in the PR. `docs/new-tool-playbook.md` contains
the full playbook text plus two copy-ready spec examples (feature flags and
refunds).

## Deliberately not production-ready

- Dev auth is a signed cookie over seeded users; the Entra provider is a stub.
- Session secret defaults to a hardcoded dev value.
- SQLite for dev (schema kept Postgres-safe: `String` for JSON/enums); no
  migrations — `db push` only.
- Audit immutability is enforced at the Prisma layer and must be re-enforced
  with Postgres privileges in prod; raw SQL could bypass the extension.
- PII masking is field-level on DTOs — no encryption at rest, no row-level
  security.
- No rate limiting, pagination server-side, or hardening of any kind.
- Tool isolation is enforced by lint + code review, not by a runtime sandbox.
