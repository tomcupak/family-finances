# Meta

This file is the source of truth for project conventions. Keep it compact — prose over code examples (code is in the repo), orientation points over exhaustive lists. Update it proactively when you discover a new convention, correct an outdated rule, or find that something here was wrong.

---

# Architecture

Family Finances is a household budget app: meter readings (electricity, water, gas), expenses, income, savings and taxes per account (family/budget). It is intentionally small: **one NestJS API app** (`apps/api`), **one React app** (`web/apps/family-finances`), one shared `family_finances` Postgres database. There is no multi-app split (no workers, no edge servers, no AMQP) — everything lives in the single `api` process.

`libs/domains` holds business logic (services, DTOs, types) the way a larger monorepo would split it across multiple apps — kept here for consistency with the pattern even though only `apps/api` consumes it today, and so a second app (e.g. a scheduled report worker) can be added later without moving code.

`libs/database` holds the Drizzle schema/migrations and `DbProvider`/`DbModule`. `libs/shared` holds `Api.createErrorDto`/`Api.gatewayException` — the typed-error-DTO helpers used by every controller.

**Auth is a single shared secret**, not a user/account system: `TokenGuard` (`libs/domains/src/auth/token.guard.ts`) checks `Authorization: Bearer <token>` against `config.apiToken` via `crypto.timingSafeEqual`, applied globally in `main.ts`. Mark an endpoint public with `@PublicEp()` (`libs/domains/src/auth/auth.decorators.ts`) — used for the root health-check only; everything else requires the token.

**Accounts** (`libs/domains/src/accounts`, table `account`): an account is a family/budget ("Rodina", "Firma"), **not** a user — auth stays the single shared token. Per-account data (expenses, income, savings, taxes) references `account.guid` with `onDelete: 'cascade'`, so deleting an account removes everything under it. Meter sheets/readings are global, not per account.

**Validation**: a global `ValidationPipe({ transform: true, whitelist: true })` is registered in `main.ts`, so `class-validator` decorators on body/query DTOs are enforced (400 with Nest's default message array). Domain-level validation the decorators can't express (e.g. blank-after-trim name) is a typed service error mapped to a typed 400 DTO.

**Meters** (`libs/domains/src/meters`, tables `meter_sheet`/`meter_reading`): a named, global (not per account) sheet ("Dům – elektřina", "Elektroauto") with a `utility` (`UtilityType.electricity | water | gas`; units kWh / **litres** / m³) an `archived` flag and an `entryMode` (`MeterEntryMode.state` = cumulative meter states, `increment` = each reading is already the consumption for the period ending on its date, e.g. a car charger's kWh for the month; fixed after creation like `utility`); readings are unique per (sheet, date). `valueHigh` is VT for electricity and the only state for water/gas, `valueLow` is NT — electricity only (service enforces: electricity needs both, water/gas must not send `valueLow`). There are no utility prices here — prices are entered monthly on expenses. `MetersService.getMonthlyConsumption(sheetGuid, 'YYYY-MM')` = sum of diffs of readings **dated within the month** (each against its previous reading, which may be older; for `increment` sheets just the sum of their values, private `consumptionOf`) — this is what expenses bill.

**Expenses** (`libs/domains/src/expenses`, table `expense`, per account): name, `ExpenseCategory` (taxes/services/car/kids/other), `amount` (Kč per occurrence), `ExpenseRecurrence` (once/monthly/quarterly/yearly = step 1/3/12 months from `startMonth`, see `ExpensesTypes.RECURRENCE_STEP`), `endMonth` inclusive or `null` = indefinitely; a `once` expense is stored with `endMonth = startMonth` so "ended" (`endMonth < current month`) is uniform. `ExpensesService.getMonth` = SQL narrows to active rows, private `occursIn` checks the step; returns items + totals for **all** categories (zeros included, `CATEGORY_ORDER`). Per-account routes are scoped by an `:accountGuid` path prefix (`/expenses/:accountGuid`, `/expenses/:accountGuid/:guid`, `/expenses/:accountGuid/month/:month`); an item of another account is a 404. Domain services verify the account via the injected `AccountsService.get` (throws `AccountsTypes.AccountNotFoundError`, controller maps it to `AccountsDto.AccountNotFoundError`) — import `AccountsModule` into the domain module.

**Meter-linked expenses** (`expense.meterSheetGuid`, FK `set null`; table `expense_utility_price`, unique (expense, month), cascade): such an expense must be `monthly` (`LinkedExpenseNotMonthlyError`) and is stored with `amount = 0`; `getMonth` replaces its amount with `MetersService.getMonthlyConsumption` × price + `fixedFee` (private `computeUtilityAmount`: electricity VT×VT price + NT×(NT price ?? VT price), water litres/1000 × price per m³, gas m³ × price) and attaches a `utility` object (consumption, used price, `priceMonth`, `priceConfirmed`). A month without its own price row inherits the latest earlier one (`selectDistinctOn` + `lte`); no price at all = amount 0. `PUT/DELETE /expenses/:accountGuid/:guid/prices/:month` upserts/removes the month's own price (= confirm / revert to inherited). `ExpensesModule` imports `MetersModule` and `TaxesModule`.

**Payees & payments** (`libs/domains/src/payees`, table `payee` unique (account, name), cascade on account; routes `/payees/:accountGuid[/:guid]`): who an account pays to — `name`, `bankAccount` (Czech `[prefix-]number/bank` with the mod-11 checksum, or an IBAN; validated/normalized via `BankAccount.parse`, response adds computed `iban`) and optional `variableSymbol`. An expense has at most one payee (`expense.payeeGuid`, FK `set null`; a payee of another account → `PayeeNotFoundError` → 400 on expense save). `ExpensesService.getMonth` returns `payments` (private `paymentsOf`): per payee with something in the month — its occurring items + corrections of its expenses applied in the month (`MonthCorrection.payeeGuid`), `amount`, `spayd` (QR string via `BankAccount.spayd`, only with an IBAN and amount > 0) and the paid mark. Paid = table `payee_payment` unique (payee, month), cascade on payee, storing the amount at marking time (`paidAmount` ≠ `amount` = the month changed since; the UI offers to re-confirm). `PUT/DELETE /expenses/:accountGuid/payees/:payeeGuid/payments/:month` marks/unmarks (`PaymentNotInMonthError` 400 when nothing is paid to the payee that month). `ExpensesModule` imports `PayeesModule`.

**Tax advances in expenses**: `getMonth` also returns `taxAdvances` (`TaxesService.getMonthAdvances`) and counts their total in the `taxes` category and `total` — the advances are entered only on the Daně page, the Náklady month view shows them as read-only rows „Záloha – …“ in the Daně category.

**Expense corrections** (table `expense_correction`, FK cascade on expense; SPOT-price overpayment/underpayment): `forMonth` = corrected month (the expense must occur in it, `ExpenseNotInMonthError`), `applyMonth` = month it is counted in (default `forMonth + 1`, never earlier), `amount` + underpayment / − overpayment. Input is exactly one of `amount` (the difference) or `paidAmount` (stored as paid − the computed month amount, incl. meter-linked computation via private `computeMonthAmount`); zero difference is rejected. `getMonth` returns them as a separate `corrections` list (rows of `applyMonth`, with `expenseName`/`category`) **included in `categories`/`total`** — consumers of month totals (e.g. the overview) get corrections for free; each item also lists its own `corrections` (`forMonth` = that month). Routes: `/expenses/:accountGuid/:guid/corrections[/:correctionGuid]`.

**Income** (`libs/domains/src/income`, tables `income_year` unique (account, year) + `income_month` unique (year, month 1–12, DB `check`), both cascade): a year is `IncomeType.employee` (HPP: `grossSalary`, `netSalary` null = gross) or `self_employed` (OSVČ: `hourlyRate`, `workingDays`, `vacationDays` (0.5 step, ≤ workingDays), `expectedInvoice`). The year also stores `vacationAllowance` (OSVČ vacation days for the year, default `IncomeTypes.DEFAULT_VACATION_ALLOWANCE` = 27; a settings update with it omitted keeps it) and the response computes `vacationRemaining` = allowance − Σ month `vacationDays` (negative = over-assigned; the „Dny dovolené“ card on the Příjmy page). Creating a year inserts all 12 months (working days from `CzechCalendar.workingDays`, hourly rate from `defaultHourlyRate`); changing the default moves months still on the old default. Months are integers 1–12 here (not `YYYY-MM`) under `/income/:accountGuid/:year[/months/:month]`; month updates return the whole year. Each month carries computed `earned` = rate × 8 × (workingDays − vacationDays) = the real invoice, `vacationSaving` = earned − expectedInvoice (transfer to the vacation savings account, − = withdrawal) and the cumulative `vacationBalance` (Σ earned − Σ expectedInvoice from January). Readers for other domains: `findYear` (null = no plan), `getYear` (throws), `getVacationBalance(accountGuid, 'YYYY-MM')` (null for HPP / no plan). **Year lock**: every mutation goes through private `assertYearEditable` → public `isYearLocked` (= the account's `tax_return` of the year has `closedAt`; queried directly on the table, not via `TaxesService`, because taxes depend on income — avoid the DI cycle) → `IncomeYearLockedError` → 409 `income_year_locked`; the year response has `locked`.

**Savings** (`libs/domains/src/savings`, table `savings_goal`, cascade on account): `currentBalance` as of `balanceDate` (a `date`, updated by hand — no interest), `targetAmount` by the end of `targetMonth`. Nothing computed is stored; private `planOf(goal, today)`: contributions start in the balance month if it is **today's** month, else the month after; `monthlyContribution` = (target − balance) / months to `targetMonth` inclusive, **rounded up** to haléře (0 when reached / no month left). `inMonth` adds, for a chosen month, `expectedBalance` (balance + contribution × elapsed plan months, capped at target) and `contributionInMonth` (= difference to the previous month's expected balance, so the last month only tops up the rounding). **Confirming a contribution** (`confirmedContribution` column): `POST /:guid/confirm` sets `currentBalance` = the current month's `expectedBalance`, `balanceDate` = today and stores the month's contribution — the plan then starts the month after, while `inMonth` still reports that contribution in its month (`contributionConfirmed: true`), so month totals don't change; `DELETE /:guid/confirm` subtracts it again. `updateBalance` (and `update` when the balance/date change) clears it. Public reader for other domains: `SavingsService.getMonth(accountGuid, 'YYYY-MM')` → `totalContribution`, `totalExpectedBalance`, `goals[]`. Every public method takes an optional `today` (`YYYY-MM-DD`, default `Months.today()`) so specs are date-independent — follow this for other "as of today" logic. Routes: `/savings/:accountGuid` (list as of the current month), `/month/:month`, `/:guid`, `PUT /:guid/balance` (quick update, `balanceDate` defaults to today).

**Taxes** (`libs/domains/src/taxes`, tables `tax_return` unique (account, year) + `tax_advance` unique (return, month 1–12, `TaxAdvanceKind` social/health/tax), both cascade): an OSVČ tax return per year with its constants stored on the row (rates in %, minimums/discounts in Kč/year; a new return copies them from the nearest **earlier** return of the account, else `TaxesTypes.DEFAULT_CONSTANTS`). Income = `incomeOverride` ?? Σ `expectedInvoice` of the income plan (`IncomeService.findYear`, 0 without a plan). Private `calculate` rounds every step to haléře (spec has the modelling data 1 000 000 → net 929 388). Advances: a missing row = 0; `PUT /taxes/:accountGuid/:year/advances/:month/:kind` upserts, `applyToFollowingMonths` = „nastavit od měsíce" (copies to months..12). Settlement per kind: `difference` = computed − Σ advances (+ doplatek, − přeplatek). **Closing**: `POST …/close` only when `today > YYYY-12-31` (`TaxYearNotFinishedError` → 409 `tax_year_not_finished`; responses carry `canClose`), `POST …/reopen` clears `closedAt`; a closed return rejects update/delete/advances with 409 `tax_return_closed` and locks the year's income (see Income). Public reader for other domains: `TaxesService.getMonthAdvances(accountGuid, 'YYYY-MM')` → `{ social, health, tax, total }` (zeros without a return). Methods take an optional `today` like Savings.

**Overview** (`libs/domains/src/overview`, no tables): a month is viewed as what is **paid in it** — the income (and the OSVČ vacation saving/balance tied to it) is the one **for the previous month** (`income.forMonth`, paid out a month later), expenses and savings contributions are those of the month itself. `OverviewService.getMonth(accountGuid, month?, today?)` only **composes** the other domains' public readers — `ExpensesService.getMonth` (category totals incl. meter-linked amounts and applied corrections; adds `correctionsTotal` and `unconfirmedPrices`), the advances (`advances` = `expenses.taxAdvances` — already part of the expenses total, Overview doesn't call `TaxesService`), `IncomeService.findYear` of the previous month's year (OSVČ the real invoice `earned`, HPP `netSalary ?? grossSalary`, no plan = `type: null`, 0; the OSVČ month's `vacationSaving`/`vacationBalance`, null otherwise), `SavingsService.getMonth` (passes `today`) — and computes just `remaining` = income − vacationSaving − expenses (incl. advances) − savings contributions. Never re-implement a domain's calculation here; add a reader to that domain instead. `OverviewModule` imports the Expenses, Income and Savings modules (it is the top of the DI graph — nothing may depend on it). Routes: `GET /overview/:accountGuid` (current month) and `/overview/:accountGuid/:month`.

**Bank accounts**: `BankAccount` from `@family-finances/shared` (`parse` → `{ normalized, iban } | null`, `spayd` = Czech „QR Platba" string: diacritics stripped from `MSG`, ≤ 60 chars), pure helpers with a spec.

**Czech calendar**: `CzechCalendar` from `@family-finances/shared` (`easterSunday`, `publicHolidays` incl. Good Friday + Easter Monday, `workingDays(year, month)`), pure helpers with a spec.

**Consumption bucketing** (`MetersService.getConsumption`, chart only): given a date range and an interval (day/week/month/year), each pair of consecutive readings contributes a constant daily rate to every calendar day it spans, so a reading taken mid-period is split proportionally across the buckets it crosses instead of being dumped into one; VT and NT are bucketed separately and summed. `increment` readings are first turned into an equivalent cumulative series (private `incrementsToStates`: each increment rises over the days since the previous reading, but never before the first day of its month). See the private `buildBuckets`/`splitAcrossBuckets` methods and their spec in `meters.service.spec.ts`.

**Months**: in the API a month is a `YYYY-MM` string, in the DB a `date` on the first day (`YYYY-MM-01`). Use the `Months` helpers from `@family-finances/shared` (`isValid`, `firstDay`, `lastDay`, `add`, `diff`, `fromDate`, `today`/`current` = local date/month of now) and `Api.ParseMonthPipe` for `:month` path params (400 `{ code: 'invalid_month' }`, document it with `@ApiBadRequestResponse({ type: Api.InvalidMonthError })` + an `@ApiParam`).

# Config files

Each app has a single `config` object exported from `app.config.ts`. Always embed new configuration as a nested property inside that object — never export additional standalone config objects from the same file.

Secrets with a public dev default (`API_TOKEN`, `POSTGRES_PASSWORD`) go through the local `secret()` helper in `apps/api/src/app.config.ts`: under `NODE_ENV=production` (set by the systemd unit) a missing value throws at startup instead of silently using the default.

# Deploy

`scripts/deploy`, full server setup guide in `scripts/deploy/README.md`. The target `user@host` is `DEPLOY_TARGET` from the gitignored repo-root `.env` (loaded by `load_deploy_env` in `scripts/deploy/lib.sh` and `scripts/deploy/web/lib.sh`; an explicit argument wins; optional `DEPLOY_SSH_KEY` → `SSH_OPTS` passed to every `ssh`/`scp`) — **never commit a real domain/host into the repo**, docs use `finances.example.com`. `npm run deploy:api` builds a `.deb` (bundled Node.js runtime, prod `node_modules`, migrations; systemd `family-finances-api`, runs as system user `family-finances`, secrets in `/etc/family-finances/api.env`), `npm run deploy:web` zips the Vite build into `/var/www/family-finances/web` without sudo, with `config.json` symlinked to `/etc/family-finances/web/config.json`. The web reads `apiUrl` from `/config.json` at startup (`main.tsx`) before rendering. `webpack.common.mjs` sets `externals` with an allowlist for `@family-finances/*` — the npm workspace symlinks would otherwise make Nest's default `nodeExternals()` leave the libs as runtime `require()`s of TS source. Packaging runs `npm ci --omit=dev`, so `package-lock.json` must stay in sync (`npm install --package-lock-only`).

# DB migrations

Migration files (`*.sql`, `*_snapshot.json`, `_journal.json`) are **never edited manually** — they are always generated. If a change is needed, discard the current generated files and regenerate.

## Naming migrations

Always pass `--name` when generating so the file name describes the change (run from `libs/database/src/core/`, matching `drizzle.config.ts`'s relative `schema`/`out` paths — or use `npm run db`, which does this for you):

```bash
cd libs/database/src/core && node ../../../../node_modules/drizzle-kit/bin.cjs generate --name=descriptive_name
```

Use snake_case describing what changed (e.g. `add_reading_note`, `add_price_currency`).

drizzle-kit asks interactively "create or rename?" when one migration both drops a table and creates another — this fails without a TTY. Split it: first remove the old tables from `schema.ts` and generate a `drop_…` migration, then add the new tables and generate an `add_…` one (see `0002_drop_utility_reading_price` / `0003_add_meter_sheet`).

## Squashing migrations

Squashing is the only permitted exception to the no-manual-edits rule. Perform it on request ("squash migrations to N").

**Precondition:** migration N must already be applied on all environments including production.

Drizzle tracks applied migrations by timestamp (`when` in the journal = `created_at` in `drizzle.__drizzle_migrations`). The hash is only written on insert and never validated retroactively — so replacing the SQL content of an already-applied migration file is safe.

**Steps:**

1. Concatenate SQL files `0000_*.sql` through `000{N-1}_*.sql`, append the original content of `000N_*.sql`, using `\n--> statement-breakpoint\n` as the separator between each migration. Overwrite `000N_*.sql` with the result.
2. In `meta/_journal.json` remove all entries with `idx` 0 through N-1. The entry for N stays unchanged (`idx`, `when`, and `tag` must not change).
3. Delete SQL files `0000_*.sql` through `000{N-1}_*.sql`.
4. Delete snapshot files `meta/0000_snapshot.json` through `meta/000{N-1}_snapshot.json`. `meta/000N_snapshot.json` becomes the new baseline; all subsequent snapshots stay as-is.

**Why existing DBs are safe without touching `drizzle.__drizzle_migrations`:** Drizzle fetches only the last applied record (`ORDER BY created_at DESC LIMIT 1`) and runs only migrations where `folderMillis > lastDbMigration.created_at`. The squashed migration has `folderMillis = W_N` and the DB already has a record with `created_at >= W_N`, so `W_N < W_N` is false → skipped. Migrations N+1 onwards run normally. On a fresh DB: `lastDbMigration = undefined` → the squashed migration runs in full, followed by N+1 onwards.

# Types files

Constants and types in `<entity>.types.ts` files must be wrapped in a namespace named after the module (e.g. `MetersTypes`). This keeps IDE auto-imports grouped and unambiguous.

# Services

Helper functions in service files must be private methods on the class — never standalone functions at module level outside the class.

# Controllers

Controllers must contain only endpoint handler methods — no helper functions and no module-level constants.

- Helper functions → domain service (`libs/domains/src/<domain>/<entity>.service.ts`) or `libs/shared` for logic without domain context
- Constants → domain service or `<entity>.types.ts`

## Error response decorators

Use `Api.createErrorDto` from `@family-finances/shared` to define typed error response classes in the DTO namespace, then reference them in controller decorators via `{ type: ... }`.

**In the DTO file** (`<entity>.dto.ts`):
```ts
import { Api } from '@family-finances/shared'

export namespace SomeDto {
  export enum ErrorCodes {
    SOME_ERROR = 'some_error',
  }

  export class SomeConflictError extends Api.createErrorDto([ErrorCodes.SOME_ERROR]) {}
}
```

**In the controller**:
```ts
@ApiConflictResponse({ type: SomeDto.SomeConflictError })
@ApiNotFoundResponse({ type: SomeDto.SomeNotFoundError })
```

Never use `{ description: '...' }` alone — always use `{ type: ... }` with a typed error DTO so Swagger shows the possible error codes.

**`nullable: true` on a `type: <class ref>` property isn't representable in OpenAPI 3** (Nest emits an invalid `oneOf` schema orval's codegen rejects). Either drop `nullable` and document the possible-null case in prose, or wrap in `allOf` — `@ApiProperty({ allOf: [{ $ref: getSchemaPath(X) }], nullable: true })` + `@ApiExtraModels(X)` on the class (see `ExpensesDto.MonthExpense.utility`; orval generates `X | null`).

## Service error signalling

Services signal domain errors by throwing typed error classes, **not** by returning discriminated unions or `null`/`false` for failure cases.

Define error classes in `<entity>.types.ts` inside the module namespace:

```ts
// readings.types.ts
export namespace ReadingsTypes {
  export class DuplicateReadingDateError extends Error { public code = 'duplicate_reading_date' }
  export class ReadingNotFoundError extends Error { public code = 'reading_not_found' }
}
```

The controller catches them and maps to HTTP exceptions:

```ts
try {
  await this.someService.doSomething(...)
} catch (err) {
  if (err instanceof SomeTypes.ThingNotFoundError)
    throw Api.gatewayException(NotFoundException, SomeDto.ErrorCodes.ThingNotFound)
  throw err  // re-throw unknown errors
}
```

**Drizzle wraps the pg driver error** — the raw `pg` `DatabaseError` (with `.code`, e.g. `23505` for a unique-constraint violation) is on `err.cause`, not on `err` itself. See `MetersService.rethrowUnique`/`AccountsService.rethrowDuplicate` for the cast needed (`Error.cause` typings require an ES2022 lib this project doesn't target).

Return `void` (or a data result) on success. The `throw err` at the end ensures unexpected errors propagate normally.

# Non-null assertions

Avoid the non-null assertion operator (`!`) except where TypeScript's control-flow analysis genuinely cannot narrow the type and a `null`/`undefined` value is structurally impossible at that point. Prefer explicit checks (`?? fallback`, `if (!x) throw ...`, or a typed guard) so that unexpected `undefined` from external sources produces a clear error rather than a silent runtime crash.

# DTOs

Every `@ApiProperty()` decorator must include an explicit `type` option. Use primitive strings (`'string'`, `'integer'`, `'boolean'`) for scalars, a class reference for nested objects, or `enum` for enum fields (where `type` can be omitted). Never leave `@ApiProperty()` empty or with only `nullable`/`required`/`description` options and no `type`/`enum`.

Path params with a fixed set of values (e.g. `:utility`) need an explicit `@ApiParam({ name: 'utility', enum: UtilityType })` on every route that has that segment — Nest doesn't infer it from the `ParseEnumPipe` in the handler signature, and without it orval generates a plain `string` type for the param instead of the enum union.

# Frontend (`web/apps/family-finances`)

Single Vite + React app, no i18n framework (UI is Czech, hardcoded strings). Auth is a pasted token stored in `localStorage` (see `src/utils/authToken.ts`) sent as `Authorization: Bearer` by `src/api/customInstance.ts`; a 401 response dispatches a `family-finances:auth:unauthorized` window event that `App.tsx` listens for to log out. The typed API client under `src/api/schema` is generated by orval (`npm run orval:web`) from the live `apps/api` Swagger JSON — boot the API first, then regenerate.

The selected account lives in `AccountContext` (`src/store/account.tsx`, guid persisted in `localStorage` via `src/utils/selectedAccount.ts`, falls back to the first account if the stored one is gone); use `useAccount().account` for the current account's guid in per-account pages. Until at least one account exists, every route renders `NoAccountPage` (create-first-account prompt). "Přehled" (`pages/Overview.tsx`, route `/`, the default page): `MonthSwitcher`, „Rychlé akce" card for the current month only (confirm each savings goal's contribution / „Potvrdit vše" / „Vrátit"), tiles (příjem za předchozí měsíc, spořák na dovolenou (OSVČ: `vacationBalance` as the value, the month's `vacationSaving` as +/− below), náklady (incl. advances), zbývá na útratu — savings contributions have no tile, only the „Spoření“ table), expenses per category, advances and the savings goals of the month (contribution in the month, expected balance with progress to the target). `components/MonthSwitcher.tsx` is the shared ‹ month › switcher — reuse it in month-based pages. The sidebar (`Layout.tsx`) holds the account selector and the main nav (Přehled, Odečty, Náklady, Příjmy, Spoření, Daně; account management under "Správa účtů"); route paths are the `AppPaths` enum in `App.tsx`.

"Odečty" = `pages/MeterSheets.tsx` (sheet list doubling as the bulk quick-entry form for all active sheets) and `pages/MeterSheetDetail.tsx` (`/readings/:sheetGuid`: entry form, chart, readings table with consumption since previous). `increment` sheets (`isIncrement`) label the inputs as consumption, show a single „Spotřeba" column and treat an empty tariff as 0 (only one of NT/VT may be filled). Utility labels/units/colors, the default reading date (last day of the current month, or of the previous month on the 1st–10th) and number formatting live in `src/utils/meters.ts`; typed API error codes → Czech messages in `src/utils/apiError.ts`.

"Náklady" = `pages/Expenses.tsx`: tabs "Měsíční přehled" (month switcher defaulting to the **previous** month — expenses are settled after the month ends, items + per-category totals; meter-linked items show consumption + price with a potvrzená/převzatá badge and an inline price form prefilled from the inherited price; every item has an „Oprava" form (paid amount or difference + apply month) and corrections applied in the month render as separate rows after their category's items) and "Definice nákladů" (category filter, ended expenses muted with a badge, add/edit form with the "Napojit na odečty" sheet select, which locks recurrence to monthly and hides the amount). Payees: the „Příjemci plateb" card in "Definice nákladů" and the "Příjemce platby" select of the expense form; the month view shows „Platby příjemcům" cards (items + corrections, total, QR code, „zaplaceno" checkbox) — both in `pages/ExpensePayees.tsx`. `components/QrCode.tsx` renders an SVG from the `qrcode` package's module matrix (encoder only, no UI library, no `innerHTML`). Category/recurrence labels, `YYYY-MM` month helpers (`currentMonth`, `addMonths`, `formatMonth`) and `formatMoney` live in `src/utils/expenses.ts` — reuse them in other month-based pages. `ConsumptionChart.tsx` is a hand-rolled SVG bar chart (no charting library, matching the rest of the boilerplate) — it measures its container via `ResizeObserver` and sizes the SVG `viewBox` to real pixel dimensions; **never use a percentage-based viewBox with `preserveAspectRatio="none"`** for a chart with text in it, it non-uniformly stretches glyphs into unreadable garbage. Per-bar value labels are dropped once bars get narrower than a label (e.g. the day interval) — the hover tooltip shows the value instead.

**Privacy curtain**: `components/PrivacyCurtain.tsx` (mounted in `App.tsx` for a logged-in user) covers the whole app with an opaque layer on window `blur` / `visibilitychange` → hidden, until „Odemknout" is clicked — so numbers aren't shown by accident (screen sharing). Purely visual, not a security boundary.

**Installable (PWA)**: `public/manifest.webmanifest` (standalone, theme `#15803d`) + icons in `public/icons/` (192/512 `any`, 192/512 `maskable` full-bleed, 180 `apple-touch-icon`, 32 favicon) rendered from `public/favicon.svg` (green gradient, a wallet drawn in white round-capped strokes; the maskable and apple-touch variants are the same SVG without the rounded corners, drawing kept inside the 80 % safe zone). Regenerate the PNGs when the SVG changes (e.g. `sharp` in a scratch dir — it's not a project dependency). The same `favicon.svg` is the sidebar logo (`Layout.tsx`) and the login-page logo. No service worker on purpose: Chrome doesn't require one for install, and it would fight the `version.json` update check.

`AppPaths` (route enum) lives in `src/appPaths.ts`, **not** in `App.tsx`: `App.tsx` imports every page, and pages/`Layout` importing back from `App.tsx` formed a cycle that left `AppPaths` undefined at module evaluation and crashed the app on load.

**Responsive layout**: below 860px `Layout.tsx` turns the sidebar into an off-canvas drawer (burger button in the header, backdrop, closes on navigation/account switch/Escape); `--content-padding` drops to 16px. Wide tables sit in `.TableScroll`; for tables that are used on a phone, hide secondary columns with `.HideOnMobile` or restack rows (see `.BulkTable` — the bulk reading entry, which is done from mobile monthly). `input`/`select` are `box-sizing: border-box`, so `width: 100%` fits its container.

"Spoření" = `pages/Savings.tsx`: goals table (balance + its date, target, deadline, monthly contribution, expected balance at the end of the current month, progress bar), inline "Aktualizovat stav" form (sends today as `balanceDate`), add/edit form below.

"Daně" = `pages/Taxes.tsx`: year switcher (defaults to the previous year until June), create card when the year has no return, status bar with Uzavřít (disabled unless `canClose`) / Znovu otevřít, the calculation table with formula hints, advances table 12 × 3 with an inline per-month form (kind, amount, „Nastavit od měsíce" checkbox), settlement (doplatek/přeplatek) and the constants form incl. the income override; everything read-only when closed. Labels/constant fields in `src/utils/taxes.ts`.

# Unit tests

- Framework: Jest + NestJS Testing (`@nestjs/testing`)
- Name the file `<name>.service.spec.ts` next to the tested file
- Test in isolation: mock dependencies via `{ provide: X, useValue: mockX }`
- Define mocks as `const mockX = { method: jest.fn() }` at module level
- `jest.clearAllMocks()` in `beforeEach`
- Prefer `expect.objectContaining()` over exact full-object matching
- For error handling: assert the thrown typed error class (e.g. `rejects.toThrow(SomeTypes.SomeError)`)
- Use helper factory functions (`makeClient`, `makeCase`) for repeated test objects
- Private methods: test through the public interface — exception is methods with non-trivial combinatorial logic (branching, formatting, grouping) where the public-method setup adds unnecessary boilerplate; use `service['privateMethod'](...)` and test directly in that case (see `meters.service.spec.ts`'s bucketing tests)

**Service instantiation** — two equally valid patterns: direct (`new MyService(mockDep as never)`) or via `Test.createTestingModule` when DI resolution matters.

# DB integration tests

Use when you need to verify actual DB behavior: upsert conflict resolution, unique constraints, query filtering. Place them in the **same `.spec.ts` file**, after the unit tests, in a `describe('DB', ...)` block.

```ts
describe('DB', () => {
  let db: DbProvider

  beforeAll(async () => {
    db = new DbProvider({ core: getTestDbCredentials() })
    await db.onApplicationBootstrap()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    await truncateTestDb(db.core)
    service = new MyService(db)
  })
})
```

`truncateTestDb`/`getTestDbCredentials`/`migrateTestDb`/`dropAndCreateTestDb` live in `libs/database/src/testing` (import via the `@family-finances/database/testing` path alias; credentials default to `localhost:10400`/`family_finances_test` and are overridable via `TEST_DB_HOST`/`TEST_DB_PORT`/… env vars) and are wired into `jest.global-setup.ts` (drops + recreates + migrates `family_finances_test` once per test run).

# Running Jest / ts-node (WSL)

Services run under **podman**, not docker: `podman-compose up -d` from the repo root (Postgres container `family-finances-postgres` on `localhost:10400`). If `localhost:10400` hangs while the container is up, WSL's mirrored networking is clobbering netavark's loopback NAT mark — the boot script `/usr/local/sbin/fix-podman-loopback-nat.sh` restores it but only for `10.89.0.0/24`; add the same nft rule for this project's podman network subnet (`podman inspect family-finances-postgres` → IP).

`node` is not on PATH by default — prefix every invocation:

```bash
PATH="/root/.nvm/versions/node/v24.10.0/bin:$PATH" node_modules/.bin/jest --testPathPatterns="<pattern>" --no-coverage
```

Note: `--testPathPattern` (singular) is deprecated; use `--testPathPatterns` (plural).

**Booting `apps/api` locally**: `npm run dev:api` (`nest start --watch api`) needs the npm workspace symlinks under `node_modules/@family-finances/*` (set up via the root `package.json`'s `workspaces` field — run `npm install` after cloning if they're missing). If webpack module resolution ever breaks for the local `@family-finances/*` libs, bypass it with:

```bash
PATH="/root/.nvm/versions/node/v24.10.0/bin:$PATH" node -r tsconfig-paths/register -r ts-node/register apps/api/src/main.ts
```

This resolves `@family-finances/*` via the root `tsconfig.json` `paths` field directly from TS source.
