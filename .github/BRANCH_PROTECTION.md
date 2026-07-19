# Main Branch Protection Rules

## Ruleset Name
`Main Branch Protection`

## Branches to protect
`main`

---

## Rules

| Rule | Setting | Enabled |
|------|---------|---------|
| Restrict creations | Only allow users with bypass permission to create matching refs | ✅ |
| Restrict updates | Only allow users with bypass permission to update matching refs | ✅ |
| Restrict deletions | Only allow users with bypass permission to delete matching refs | ✅ |
| Block force pushes | Prevent users with push access from force pushing to refs | ✅ |

## Pull Request Rules

| Rule | Setting | Enabled |
|------|---------|---------|
| Require a pull request before merging | Require all commits be made to a non-target branch and submitted via a pull request | ✅ |
| Required approvals | 1 | ✅ |
| Dismiss stale pull request approvals when new commits are pushed | New, reviewable commits pushed will dismiss previous pull request review approvals | ✅ |
| Require review from Code Owners | Require an approving review in pull requests that modify files that have a designated code owner | ✅ |
| Require approval of the most recent reviewable push | The most recent reviewable push must be approved by someone other than the person who pushed it | ✅ |
| Require conversation resolution before merging | All conversations on code must be resolved before a pull request can be merged | ✅ |

## Merge Settings

| Rule | Setting | Enabled |
|------|---------|---------|
| Allowed merge methods | Squash + Merge commit | ✅ |

## Status Check Rules

| Rule | Setting | Enabled |
|------|---------|---------|
| Require status checks to pass | Choose which status checks must pass before the ref is updated | ✅ |
| Status checks to add | `build`, `lint`, `test`, `validate` | — |
| Require branches to be up to date before merging | Pull requests must be tested with the latest code | ✅ |
| Do not require status checks on creation | Leave unchecked | ❌ |
