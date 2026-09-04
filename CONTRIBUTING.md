# Contributing to fastify-extras

## Rules

There are a few basic ground-rules for contributors:

1. **Non-main branches** ought to be used for ongoing work.
2. Contributors should attempt to adhere to the prevailing code-style.
3. Before submitting a PR for a major new feature, or introducing a significant change, please open an issue to discuss the proposal with maintainers.

## Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to automate versioning and releases.

If your PR affects anything used by consumers (API, types, runtime behavior, or usage-facing docs), add a changeset by **creating the file manually**.

1. **Check `.changeset/` first** for an existing entry that already covers your change — do not create duplicate or overlapping changesets in the same PR.
2. Create `.changeset/<descriptive-name>.md`, where `<descriptive-name>` is a short, kebab-case slug describing the change (e.g. `bugsnag-plugin-async-init.md`).
3. Add YAML front matter with the bump type, followed by a concise summary:

   ```md
   ---
   "@lokalise/fastify-extras": minor
   ---

   One-line summary of what changed.
   ```

4. Commit the file with your PR.

Create **one changeset per logical change** — a PR with unrelated changes should have multiple changesets.

> The interactive `pnpm changeset` CLI is available as an optional alternative, but manually authored changesets are preferred so descriptions stay specific and file names readable.

> **Note:** If you add headers inside a changeset, use `####` or `#####` only. Shallower headers will break the final CHANGELOG and upstream tooling.

**Choose the correct bump type:**

- `patch` — bug fixes
- `minor` — new features, backwards-compatible
- `major` — breaking changes

**Writing a good description:**

- Focus on user-facing impact; skip implementation details
- Keep it to 1–3 sentences
- Use past tense for what you did ("Added support for X") and present tense for package behavior ("The plugin now handles Y")

Changes that must not trigger a release (CI tweaks, internal refactors, dependency bumps) either add an empty changeset (`pnpm changeset --empty`) or carry the `skip-release` label, which skips the changeset check in CI.

## Releases

Releases are triggered automatically when a PR with a changeset is merged to `main`.
Do not bump version numbers manually — versioning is handled by the release pipeline.

## Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

- (a) The contribution was created in whole or in part by me and I have the
  right to submit it under the open source license indicated in the file; or

- (b) The contribution is based upon previous work that, to the best of my
  knowledge, is covered under an appropriate open source license and I have the
  right under that license to submit that work with modifications, whether
  created in whole or in part by me, under the same open source license (unless
  I am permitted to submit under a different license), as indicated in the file;
  or

- (c) The contribution was provided directly to me by some other person who
  certified (a), (b) or (c) and I have not modified it.

- (d) I understand and agree that this project and the contribution are public
  and that a record of the contribution (including all personal information I
  submit with it, including my sign-off) is maintained indefinitely and may be
  redistributed consistent with this project or the open source license(s)
  involved.
