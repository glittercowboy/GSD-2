# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on **`gsd-build/gsd-2`** (the `upstream` remote). Use the `gh` CLI for all operations.

This clone may have multiple remotes (`origin` is a personal fork, `upstream` is the canonical repo). Always pass `-R gsd-build/gsd-2` so commands hit the canonical tracker rather than auto-resolving to the fork.

## Conventions

- **Create an issue**: `gh issue create -R gsd-build/gsd-2 --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> -R gsd-build/gsd-2 --json number,title,body,labels,comments --jq '{number, title, body, labels: [.labels[].name], comments: [.comments[].body]}'`.
- **List issues**: `gh issue list -R gsd-build/gsd-2 --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> -R gsd-build/gsd-2 --body "..."`
- **Apply / remove labels**: `gh issue edit <number> -R gsd-build/gsd-2 --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> -R gsd-build/gsd-2 --comment "..."`

## When a skill says "publish to the issue tracker"

Create a GitHub issue on `gsd-build/gsd-2`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> -R gsd-build/gsd-2 --comments`.
