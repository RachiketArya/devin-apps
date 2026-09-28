# devin-apps — the paved road for internal tools

A proof of concept that a fintech's internal tools (today on Power Apps) can be
built and owned as code. Identity, permissions, approvals and audit are
written once in `src/platform/`; each tool lives in `src/apps/<tool>/` and is
small, consistent and safe by construction — tool code *cannot* reach the
database except through the platform's authorized, audited wrappers.

The first tool on the road is the **KYC review queue** (`src/apps/kyc/`).

## Setup

```bash
pnpm install        # also runs prisma generate
pnpm db:reset       # prisma db push --force-reset + seed
pnpm dev            # http://localhost:3000
```

Stack: Next.js (App Router) · TypeScript strict · Prisma · SQLite dev /
Postgres prod · Tailwind + shadcn/ui · Zod · Vitest · pnpm.

## Seeded users (one per role)

Sign in at `/sign-in` (dev provider — no passwords anywhere). For automated
checks there is a one-step route: `/dev/sign-in?email=<email>&next=<path>`.

| Email | Role | Can do |
| --- | --- | --- |
| analyst@dev.local | analyst | claim/decide/escalate KYC cases, reveal PII (audited) |
| senior@dev.local | senior_analyst | same + approve high-risk requests in /approvals |
| finance@dev.local | finance_ops | nothing in KYC — here for future tools |
| engineer@dev.local | engineer | nothing in KYC — demonstrates default deny |
| admin@dev.local | admin | /audit page, `pii:read` (PII always unmasked) |

## What's in the platform

- **Identity** — `IdentityProvider` interface; dev provider (signed cookie, one
  seeded user per role) + `EntraIdentityProvider` stub documenting the
  OIDC/`x-ms-client-principal` switch. `IDENTITY_PROVIDER` env selects it.
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
