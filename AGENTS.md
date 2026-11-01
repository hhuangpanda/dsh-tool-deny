# dsh-tool-deny

DeepSeek Harness plugin that hides or refuses tools per agent. See `README.md` for options.

- `index.js` is the plugin. `test/fake-model.mjs` is the fake model for dsh testing, covered by `npm test`.
- Run `npm test` and `node --check index.js` after changes.
- Test real dsh behavior only in a throwaway `DSH_HOME`, never a live instance or home directory.
- Keep `cordis.patch.yml` empty. Hide lists belong in each user's own profile patch.
- Update `README.md` when options or behavior change.
- If `AGENTS.local.md` exists, follow it for local setup and full test steps.
