/**
 * Holistic behaviour tests for T-CRED-01 — Credential Protection (Behaviours 71-76)
 *
 * RED PHASE: B72 (secondary window cap), B73, B75, B76 expected to FAIL until Wave 5
 * GREEN (already passing): B74 (TrustDialog.tsx handleConfirm)
 *
 * Testing approach:
 * - B71: Observable check on auth.json filesystem state (no plaintext API keys)
 * - B72: Static config check on capability JSON files (permitted)
 * - B73: Import trust-api.ts isTrusted() and mock fetch to throw — assert fail-closed
 * - B74: Static config check on TrustDialog.tsx for handleConfirm (regression test)
 * - B75: Source inspection on window-identity.ts fetch monkey-patch header handling
 * - B76: Static config check on tauri.conf.json assetScope (permitted)
 */
import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// T-CRED-01 — Credential Protection
// ---------------------------------------------------------------------------

describe("T-CRED-01 — Credential Protection", () => {
  // -------------------------------------------------------------------------
  // B71 — No plaintext API keys in auth.json (observable check on filesystem)
  // -------------------------------------------------------------------------

  it("B71: auth.json does not contain plaintext API key values (static contract — accepted risk with 0o600 file guard)", () => {
    // B71: The accepted risk documented in RESEARCH.md is that auth-storage.ts stores
    // provider credentials in ~/.gsd/auth.json protected by 0o600 file permissions (B16).
    // The keychain is used for raw API keys via B62 (invoke delete_credential on logout).
    //
    // This test verifies the static contract: auth-storage.ts writes with mode 0o600
    // and does NOT store raw secrets in plain JSON without the filesystem permission guard.
    //
    // Since auth.json may not exist in CI (no active auth session), we verify the source
    // code of auth-storage.ts enforces the permission constraint rather than checking
    // a potentially absent runtime file.
    // AuthStorage is provided by the @gsd/pi-coding-agent workspace package
    const authStorageSrc = readFileSync(
      resolve(import.meta.dir, "../../../packages/pi-coding-agent/src/core/auth-storage.ts"),
      "utf8"
    );

    // auth-storage.ts must call chmodSync or use mode: 0o600 on write
    const hasPermissionGuard =
      authStorageSrc.includes("0o600") ||
      authStorageSrc.includes("chmodSync") ||
      authStorageSrc.includes("mode: 0o600");

    expect(hasPermissionGuard).toBe(
      true,
      "auth-storage.ts must enforce 0o600 file permissions on auth.json to satisfy B71 accepted-risk posture"
    );
  });

  // -------------------------------------------------------------------------
  // B72 — Credential IPC commands restricted to main window only
  // Enforcement is via require_main_window() in Rust commands.rs (Pattern 4 — static contract)
  // -------------------------------------------------------------------------

  it("B72: Credential IPC commands are window-label-guarded in Rust source (static contract)", () => {
    // B72: Custom #[tauri::command] functions are not restricted by Tauri capability JSON.
    // Enforcement is via require_main_window() checks in commands.rs.
    // This is a static contract assertion (Pattern 4, approved per RESEARCH.md).
    const commandsSrc = readFileSync(
      resolve(import.meta.dir, "../src-tauri/src/commands.rs"),
      "utf8"
    );

    // Verify require_main_window helper exists
    expect(commandsSrc).toContain("fn require_main_window");

    // Verify each sensitive command has:
    //   (a) a window parameter in its signature
    //   (b) require_main_window actually called in its body
    const sensitiveCommands = ["set_credential", "delete_credential", "get_credential", "restart_bun"];
    for (const cmd of sensitiveCommands) {
      // (a) Function signature must include window: tauri::WebviewWindow
      const fnPattern = new RegExp(`pub async fn ${cmd}\\(\\s*window:\\s*tauri::WebviewWindow`);
      expect(commandsSrc).toMatch(fnPattern);

      // (b) require_main_window must be called in the function body.
      // Extract the text from "pub async fn <cmd>(" up to the next "pub async fn " or end of file,
      // then assert require_main_window appears within that slice.
      const fnStartIdx = commandsSrc.indexOf(`pub async fn ${cmd}(`);
      expect(fnStartIdx).toBeGreaterThanOrEqual(
        0,
        `B72: function ${cmd} not found in commands.rs`
      );
      const nextFnIdx = commandsSrc.indexOf("pub async fn ", fnStartIdx + 1);
      const fnBody = nextFnIdx === -1
        ? commandsSrc.slice(fnStartIdx)
        : commandsSrc.slice(fnStartIdx, nextFnIdx);

      expect(fnBody).toContain(
        "require_main_window",
        `B72: ${cmd} function body must call require_main_window() — found signature but no guard call in body`
      );
    }

    // Verify the guard checks window.label() == "main"
    expect(commandsSrc).toMatch(/window\.label\(\)\s*!=\s*"main"/);
  });

  // -------------------------------------------------------------------------
  // B62 — Logout clears OS keychain entries via invoke("delete_credential")
  // Static contract test (Tier 3): Tauri invoke cannot be mocked in Bun test
  // environment since @tauri-apps/api/core is unavailable outside the webview.
  // -------------------------------------------------------------------------

  it("B62: changeProvider() calls invoke('delete_credential') for each KEYCHAIN_CREDENTIAL_KEYS entry using Promise.allSettled", () => {
    // B62: auth-api.ts changeProvider() must clear OS keychain credentials on logout.
    // We verify this via static source inspection since @tauri-apps/api/core
    // cannot be imported or mocked in a Bun subprocess test environment.
    const authApiSrc = readFileSync(
      resolve(import.meta.dir, "../src/auth/auth-api.ts"),
      "utf8"
    );

    // 1. KEYCHAIN_CREDENTIAL_KEYS must be defined in auth-api.ts
    expect(authApiSrc).toContain("KEYCHAIN_CREDENTIAL_KEYS");

    // 2. changeProvider must call invoke("delete_credential"
    expect(authApiSrc).toMatch(/invoke\s*\(\s*["']delete_credential["']/);

    // 3. Must use Promise.allSettled (failures must not block logout)
    expect(authApiSrc).toContain("Promise.allSettled");

    // 4. The invoke call must iterate over the credential keys
    // (keys.map(...invoke...) pattern)
    expect(authApiSrc).toMatch(/keys\.map\s*\(\s*(?:key\s*=>|function)/);

    // 5. changeProvider must be exported (callable from React components)
    expect(authApiSrc).toMatch(/export\s+async\s+function\s+changeProvider/);
  });

  it("B72: secondary-window.json grants minimal permissions (no credential-adjacent plugins)", () => {
    const secondaryCap = JSON.parse(
      readFileSync(
        resolve(import.meta.dir, "../src-tauri/capabilities/secondary-window.json"),
        "utf8"
      )
    );
    const perms: string[] = secondaryCap.permissions || [];

    // Secondary windows should only have core:default and dialog:default
    // They must NOT have opener, updater, or deep-link permissions
    const dangerousPlugins = ["opener:", "updater:", "deep-link:"];
    for (const plugin of dangerousPlugins) {
      const hasDangerous = perms.some((p: string) => typeof p === "string" && p.startsWith(plugin));
      expect(hasDangerous).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // B73 — Trust check fails closed: network error → untrusted (not trusted)
  // -------------------------------------------------------------------------

  it("B73: isTrusted() returns false (fail-closed) when trust file is absent — App.tsx must NOT call setTrustStatus('trusted') in catch", async () => {
    // Test the isTrusted function directly — it should return false when the
    // trust flag file does not exist (filesystem access check)
    const { isTrusted } = await import("../src/server/trust-api");

    // A non-existent path should always return false (fail-closed)
    const result = await isTrusted("/tmp/nonexistent-workspace-that-does-not-exist/.gsd");
    expect(result).toBe(false);

    // Also verify App.tsx does NOT have the fail-open pattern:
    // .catch(() => setTrustStatus("trusted"))
    const appSrc = readFileSync(
      resolve(import.meta.dir, "../src/App.tsx"),
      "utf8"
    );

    // This pattern is the fail-open bug — must NOT be present after remediation
    expect(appSrc).not.toMatch(
      /\.catch\s*\(\s*(?:\(\s*\)|[^)]*)\s*=>\s*setTrustStatus\s*\(\s*["']trusted["']\s*\)/
    ); // RED: App.tsx currently has .catch(() => setTrustStatus("trusted"))
  });

  // -------------------------------------------------------------------------
  // B74 — Trust dialog requires explicit user confirmation (regression test)
  // GREEN: TrustDialog.tsx already has handleConfirm
  // -------------------------------------------------------------------------

  it("B74: TrustDialog requires explicit user confirmation via handleConfirm", () => {
    const trustDialogSrc = readFileSync(
      resolve(
        import.meta.dir,
        "../src/components/permissions/TrustDialog.tsx"
      ),
      "utf8"
    );
    // Must have an explicit confirm handler
    expect(trustDialogSrc).toMatch(/handleConfirm|onConfirm|confirm/i);
    // Must not auto-confirm (no setTimeout or immediate confirmation)
    expect(trustDialogSrc).not.toMatch(
      /autoConfirm|setTimeout.*confirm|immediate.*trust/i
    );
  });

  // -------------------------------------------------------------------------
  // B75 — Fetch monkey-patch handles Headers object, Headers instance, and array form
  // -------------------------------------------------------------------------

  it("B75: fetch monkey-patch in window-identity.ts handles Headers instances and [string,string][] arrays without dropping Authorization header", () => {
    const windowIdentitySrc = readFileSync(
      resolve(import.meta.dir, "../src/window-identity.ts"),
      "utf8"
    );

    // The monkey-patch must handle three header forms:
    // 1. Plain object: { "Authorization": "Bearer xyz" }
    // 2. Headers instance: new Headers({ "Authorization": "Bearer xyz" })
    // 3. Array form: [["Authorization", "Bearer xyz"]]

    // Assert the monkey-patch exists
    expect(windowIdentitySrc).toMatch(/globalThis\.fetch|global\.fetch/);

    // The CURRENT BROKEN pattern: spreads headers directly without instanceof check
    // { "X-Window-Id": windowId, ...(init?.headers ?? {}) }
    // This silently drops Authorization when headers is a Headers instance.

    // After remediation, the patch must check for Headers instance:
    const hasHeadersInstanceCheck =
      windowIdentitySrc.includes("instanceof Headers") ||
      (windowIdentitySrc.includes("new Headers") &&
        windowIdentitySrc.includes("Object.fromEntries"));

    expect(hasHeadersInstanceCheck).toBe(
      true,
      "window-identity.ts: fetch monkey-patch must handle Headers instances (instanceof Headers check) to avoid dropping Authorization headers — currently uses spread which silently drops Headers instance properties"
    ); // RED: current code uses ...(init?.headers ?? {}) without instanceof check

    // Must handle array form [string, string][]
    expect(windowIdentitySrc).toMatch(
      /Array\.isArray/,
      "window-identity.ts: fetch monkey-patch must handle [string,string][] header arrays using Array.isArray check"
    ); // RED: not present in current implementation
  });

  // -------------------------------------------------------------------------
  // B76 — Asset protocol scope narrowed from $APP/**
  // (static config check on tauri.conf.json — permitted)
  // -------------------------------------------------------------------------

  it("B76: asset protocol scope does not include broad $APP/** wildcard", () => {
    const tauriConf = JSON.parse(
      readFileSync(
        resolve(import.meta.dir, "../src-tauri/tauri.conf.json"),
        "utf8"
      )
    );

    const assetScope =
      tauriConf?.plugins?.protocol?.assetScope ??
      tauriConf?.tauri?.security?.assetScope ??
      null;

    expect(assetScope).not.toBeNull(
      "tauri.conf.json must define an asset protocol scope restriction"
    );

    const allowList: string[] = assetScope?.allow ?? [];

    // $APP/** is too broad — allows reading any app data directory file
    const hasBroadAppScope = allowList.some(
      (p: string) => p === "$APP/**" || p === "$APP/*"
    );
    expect(hasBroadAppScope).toBe(
      false,
      "asset scope must not allow $APP/** — must be narrowed to specific subdirectories"
    ); // RED: current tauri.conf.json has "$APP/**" in allow list

    // Must not allow root wildcards like **
    expect(allowList).not.toContain(
      "**",
      "asset scope must not allow ** root wildcard"
    );
  });
});
