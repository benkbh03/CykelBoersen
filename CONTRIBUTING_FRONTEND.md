# Frontend contribution guide

## Goal
Keep `main.js` as orchestration only, and place feature behavior in dedicated modules under `js/`.

## Placement rules
1. **Pure helpers** (formatters, escapes, calculations) go in `js/utils.js`.
2. **Feature behavior** goes in `js/<feature>.js` with exported functions or `create*` factories.
3. **Shared constants/config** go in `js/config.js`.
4. **Supabase access** uses `js/supabase-client.js` (single client import).
5. **Large static content** goes in data modules (e.g. `js/static-pages-content.js`), not in `main.js`.

## API/wiring conventions
- Prefer dependency injection:
  - `createSomething({ supabase, showToast, ... })`
- Preserve existing global compatibility if inline handlers depend on it:
  - keep `window.someHandler = someHandler` in `main.js` when required.
- Avoid circular imports between feature modules.

## Change strategy
- Keep refactors incremental and behavior-preserving.
- One cohesive extraction per commit.
- After each extraction run a syntax check:
  - `node --check main.js`

## Naming
- Factory modules: `createXxx...`
- Action modules: `*-actions.js`
- UI-only wrappers: `*-ui.js`
- Data/content modules: `*-content.js`
