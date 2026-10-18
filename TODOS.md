# TODOs
- vem si první task co je na řadě (task je označen H2 nadpisem)
- proveď co je zadané a následně task odeber
- před každým taskem si kompletně vyčistit session paměť
- pokud můžeš, pokračuj opět na další task
- ověřuj na reálné infrastruktuře (reálný Postgres, skutečně nabootovaná appka), ne jen typecheck/lint

### Společné konvence pro všechny tasky
- Peníze v Kč, DB `numeric(12, 2)` `mode: 'number'`. Jednotkové ceny `numeric(12, 4)`.
- Měsíc = string `YYYY-MM` v API, v DB `date` na první den měsíce (`YYYY-MM-01`).
- Každá doména = `libs/domains/src/<domain>` (service, dto, types, module, spec) + controller v `apps/api/src/<domain>`, zaregistrovat v `app.module.ts`. Dodržet CLAUDE.md (typed error DTO, `@ApiParam` pro enumy, namespace v `*.types.ts`, privátní helpery).
- Po změně API: nabootovat API, `npm run orval:web`, upravit FE. FE je česky, ručně psané CSS v `web/shared/App.css`, žádné nové UI knihovny.
- Výpočty (rozpočítání opakování, spotřeba, daně, dovolená, spoření) pokrýt unit testy; DB chování (unique, kaskády) DB integračními testy.
- Pokud task zavede novou konvenci nebo změní architekturu, aktualizuj CLAUDE.md.

## Potvrdit znaménko kontroly dovolené (čeká na uživatele)
Teď `Σ expectedInvoice − Σ (hourlyRate × 8 × (workingDays − vacationDays))` doslova dle zadání. Ověřit s uživatelem, zda kladné číslo má znamenat „schovat na spořák" (pak možná obrátit znaménko) a co přesně je „očekávaná faktura".

## Doladění po UI smoke testu
- Očekávaná faktura (OSVČ) má default 0 → kontrola dovolené i příjem v Přehledu jsou do vyplnění silně záporné. Předvyplnit z odhadu `hourlyRate × 8 × (workingDays − vacationDays)` (nebo zobrazit varování „nevyplněno").
- Nové daňové přiznání má předvyplněné slevy na manželku a děti → default daňový bonus. Zvážit default 0 pro spouseDiscount/childDiscount u prvního roku.
- Široké tabulky (Spoření, Daně – zálohy, Definice nákladů) na mobilu jen horizontálně scrollují – zvážit kartové zobrazení.
- Tooltip grafu spotřeby překrývá pravé sloupce.
- Odečty s datem v budoucnosti jsou povolené – přidat validaci (nebo aspoň varování).

### Backlog - nedělat
- uživatelské účty / přihlašování per uživatel (token auth stačí; „účet" = rodina/rozpočet, ne uživatel)
- AMQP/workers/edge-server - enver-specifické domény, nepřenášet
