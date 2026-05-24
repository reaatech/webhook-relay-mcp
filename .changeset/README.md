# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It
drives versioning and publishing for the five public `@reaatech/webhook-relay-*`
packages, which are kept in lockstep (a `fixed` group — bumping one bumps all).

## Adding a changeset

When a change should ship to npm, run:

```bash
pnpm changeset
```

Pick the affected package(s) and the bump type (`patch`/`minor`/`major`), then write a
short summary. This creates a markdown file in this folder — commit it with your PR.

## Releasing

The `Release` GitHub workflow (`.github/workflows/release.yml`) opens a "Version
Packages" PR that consumes pending changesets, bumps versions, and updates changelogs.
Merging that PR builds, tests, and publishes to npm via `pnpm release`.

To do it manually:

```bash
pnpm version-packages   # changeset version — bumps versions + changelogs
pnpm release            # build + test + changeset publish
```
