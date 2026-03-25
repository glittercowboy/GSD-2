import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const commandsRs = readFileSync(
  resolve(import.meta.dir, "../src-tauri/src/commands.rs"),
  "utf-8"
);

const libRs = readFileSync(
  resolve(import.meta.dir, "../src-tauri/src/lib.rs"),
  "utf-8"
);

const serverTs = readFileSync(
  resolve(import.meta.dir, "../src/server.ts"),
  "utf-8"
);

describe("GAP-5: reveal_path requires main window", () => {
  it("reveal_path accepts window parameter", () => {
    // Extract the reveal_path function signature
    expect(commandsRs).toMatch(/pub async fn reveal_path\(\s*window:\s*tauri::WebviewWindow/);
  });

  it("reveal_path calls require_main_window before any logic", () => {
    // Find reveal_path function body and verify guard appears before is_absolute
    const fnStart = commandsRs.indexOf("pub async fn reveal_path");
    const guardIdx = commandsRs.indexOf("require_main_window(&window)", fnStart);
    const absCheck = commandsRs.indexOf("is_absolute()", fnStart);
    expect(guardIdx).toBeGreaterThan(fnStart);
    expect(guardIdx).toBeLessThan(absCheck);
  });
});

describe("GAP-6: open_new_window requires main window", () => {
  it("open_new_window accepts window parameter", () => {
    expect(commandsRs).toMatch(/pub async fn open_new_window\(\s*window:\s*tauri::WebviewWindow/);
  });

  it("open_new_window calls require_main_window before building window", () => {
    const fnStart = commandsRs.indexOf("pub async fn open_new_window");
    const guardIdx = commandsRs.indexOf("require_main_window(&window)", fnStart);
    const buildIdx = commandsRs.indexOf("WebviewWindowBuilder::new", fnStart);
    expect(guardIdx).toBeGreaterThan(fnStart);
    expect(guardIdx).toBeLessThan(buildIdx);
  });
});

describe("GAP-7: check_for_updates and install_update require main window", () => {
  it("check_for_updates accepts window parameter", () => {
    expect(libRs).toMatch(/async fn check_for_updates\(\s*window:\s*tauri::WebviewWindow/);
  });

  it("check_for_updates calls require_main_window before updater logic", () => {
    const fnStart = libRs.indexOf("async fn check_for_updates");
    const guardIdx = libRs.indexOf("require_main_window(&window)", fnStart);
    const updaterIdx = libRs.indexOf("app.updater()", fnStart);
    expect(guardIdx).toBeGreaterThan(fnStart);
    expect(guardIdx).toBeLessThan(updaterIdx);
  });

  it("install_update accepts window parameter", () => {
    expect(libRs).toMatch(/async fn install_update\(\s*window:\s*tauri::WebviewWindow/);
  });

  it("install_update calls require_main_window before updater logic", () => {
    const fnStart = libRs.indexOf("async fn install_update");
    const guardIdx = libRs.indexOf("require_main_window(&window)", fnStart);
    const updaterIdx = libRs.indexOf("app.updater()", fnStart);
    expect(guardIdx).toBeGreaterThan(fnStart);
    expect(guardIdx).toBeLessThan(updaterIdx);
  });

  it("require_main_window is pub (accessible from lib.rs)", () => {
    expect(commandsRs).toContain("pub fn require_main_window");
  });
});

describe("GAP-1: /api/project/switch home-directory confinement", () => {
  it("server.ts imports homedir from os", () => {
    expect(serverTs).toMatch(/import\s*\{[^}]*homedir[^}]*\}\s*from\s*["']node:os["']/);
  });

  it("server.ts imports normalize from path", () => {
    expect(serverTs).toMatch(/import\s*\{[^}]*normalize[^}]*\}\s*from\s*["']node:path["']/);
  });

  it("project/switch handler checks path against homedir before access()", () => {
    // Find the /api/project/switch handler
    const switchStart = serverTs.indexOf('pathname === "/api/project/switch"');
    const homedirCheck = serverTs.indexOf("homedir()", switchStart);
    const accessCheck = serverTs.indexOf("await access(projectPath)", switchStart);
    expect(homedirCheck).toBeGreaterThan(switchStart);
    expect(homedirCheck).toBeLessThan(accessCheck);
  });

  it("project/switch returns 400 for paths outside home directory", () => {
    const switchStart = serverTs.indexOf('pathname === "/api/project/switch"');
    const section = serverTs.slice(switchStart, switchStart + 800);
    expect(section).toContain("Path must be within home directory");
    expect(section).toContain("status: 400");
  });

  it("confinement uses normalize() for safe comparison", () => {
    const switchStart = serverTs.indexOf('pathname === "/api/project/switch"');
    const section = serverTs.slice(switchStart, switchStart + 800);
    expect(section).toContain("normalize(");
    expect(section).toContain("startsWith(normalize(homedir()))");
  });
});
