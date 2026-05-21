# Workflow Visualizer

The workflow visualizer is an interactive view for project progress, execution history, dependencies, metrics, health, agent activity, changes, knowledge, captures, and export.

## Opening

```
/gsd visualize
```

Or configure automatic display after milestone completion:

```yaml
auto_visualize: true
```

## Tabs

Switch tabs with `Tab`, `Shift+Tab`, or `1`-`9` and `0`.

### 1. Progress

A tree view of milestones, slices, and tasks with completion status:

```
M001: User Management                        3/6 tasks
  ✅ S01: Auth module                         3/3 tasks
    ✅ T01: Core types
    ✅ T02: JWT middleware
    ✅ T03: Login flow
  ⏳ S02: User dashboard                      1/2 tasks
    ✅ T01: Layout component
    ⬜ T02: Profile page
```

### 2. Timeline

Chronological execution history: unit type, timestamps, duration, model, and token counts.

### 3. Dependencies

An ASCII dependency graph showing slice relationships:

```
S01 ──→ S02 ──→ S04
  └───→ S03 ──↗
```

Slice verification artifacts also surface data flow between completed slices.

### 4. Metrics

Bar charts showing cost and token usage:

- By phase (research, planning, execution, completion)
- By slice (with running totals)
- By model (which models consumed the most budget)
- By routing tier (including downgraded unit counts)

### 5. Health

Budget pressure, token pressure, environment issues, provider checks, skill-health summary, progress score, and doctor history.

### 6. Agent

Current agent activity, completion rate, session cost/tokens, pressure signals, pending captures, and recent completed units.

### 7. Changes

Completed slice summaries, modified files, verification decisions, and established patterns.

### 8. Knowledge

Persistent project rules, patterns, and lessons.

### 9. Captures

Captured notes grouped by pending, triaged, and resolved state.

### 0. Export

Download Markdown, JSON, or a current-view snapshot.

## Controls

| Key | Action |
|-----|--------|
| `Tab` | Next tab |
| `Shift+Tab` | Previous tab |
| `1`-`9`, `0` | Jump to tab |
| `↑`/`↓` | Scroll |
| `/` | Search/filter |
| `?` | Show keyboard help |
| `Escape` / `q` | Close |

The visualizer auto-refreshes every 2 seconds, staying current alongside running auto mode.

## HTML Reports

For shareable reports outside the terminal:

```
/gsd export --html              # current milestone
/gsd export --html --all        # all milestones
```

Generates self-contained HTML files in `.gsd/reports/` with progress tree, dependency graph, cost charts, timeline, and changelog. All CSS and JS are inlined — no external dependencies. Printable to PDF from any browser.

```yaml
auto_report: true    # auto-generate after milestone completion (default)
```
