# High-Level Components from pi-coding-agent

### DynamicBorder

A horizontal border line with themed color. Use for framing dialogs.

```typescript
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

// ⚠️ MUST explicitly type the parameter as string
const border = new DynamicBorder((s: string) => theme.fg("accent", s));
```

### Activity API

Lane-based activity lifecycle for status/modals/inline work. This is the canonical way to show operational progress.

```typescript
const activity = ctx.ui.activity.start({
  owner: "my-ext.fetch",
  lane: "status",
  message: "Fetching data...",
  progress: 0,
});
activity.setProgress(50);
activity.setMessage("Parsing response...");
activity.succeed("Fetch complete");

const result = await ctx.ui.activity.run(
  () => fetchData(),
  { owner: "my-ext.fetch.run", lane: "modal", message: "Fetching data..." },
);
```

### CustomEditor

Base class for custom editors that replace the input. Provides app keybindings (escape to abort, ctrl+d, model switching) automatically.

```typescript
import { CustomEditor } from "@mariozechner/pi-coding-agent";

class MyEditor extends CustomEditor {
  handleInput(data: string): void {
    // Handle your keys first
    if (data === "x") { /* custom behavior */ return; }
    // Fall through to CustomEditor for app keybindings + text editing
    super.handleInput(data);
  }
}
```

---
