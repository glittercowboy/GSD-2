# Visual Animation Manual Checklist

Use this checklist to verify every animation surface in an isolated runtime.

## Start Isolated Runtime

```bash
cd /home/whitebehemoth/Dev/Projects/gsd-2/gsd-2-status-activity
npm run test:visual:manual
```

The command creates a temp `HOME`, installs fixture extensions, and launches GSD.

## In-TUI Command Sweep

Run in this order:

1. `/anim-help`
2. `/anim-all`
3. `!sleep 3`
4. `/arminsayshi`
5. `/daxnuts`
6. `/reload`

`/anim-all` runs the full lane sweep (status, modal, countdown, inline lifecycle, decorative lifecycle) in one go.
The remaining commands are core-only visual surfaces that extension command context cannot invoke directly.

## Expected Results

| Surface | Trigger | Expected |
|---|---|---|
| Status lane spinner | `/sv`, `/anim-status` | Braille spinner animates, message phases transition, lane clears at end |
| Branch summary status flow | `/anim-branch-summary` | Status spinner + branch-summary message, then clear |
| Compaction status flow | `/anim-compaction` | Status spinner + compaction message, then clear |
| Auto-compaction status flow | `/anim-auto-compaction` | Status spinner + auto-compaction message, then clear |
| Auto-retry status flow | `/anim-auto-retry` | Status spinner + phased retry messages, then clear |
| Share modal flow | `/anim-share` | Modal bordered loader appears then editor returns |
| Modal lane loader | `/anim-modal`, `/reload` | Editor is replaced by bordered loader, message updates, editor restored |
| Countdown lane | `/anim-countdown` | Dialog title shows `(5s..0s)` countdown and auto-dismisses |
| Inline lane (bash) | `!sleep 3` | Bash card shows animated spinner while running, then completes |
| Decorative lane (Armin) | `/arminsayshi` | Animation plays and settles into final frame |
| Decorative lane (Daxnuts) | `/daxnuts` | Animation reveals image/text and then settles |

## CLI Lane (Onboarding)

`cli` lane is exercised during onboarding flows (OAuth/token validation).  
To force onboarding in a fresh shell:

```bash
TMP_HOME="$(mktemp -d)"
HOME="$TMP_HOME" GSD_CODING_AGENT_DIR="$TMP_HOME/.gsd/agent" npm run gsd
```

Expected: onboarding spinner/status messages appear and transition via the centralized activity path.
