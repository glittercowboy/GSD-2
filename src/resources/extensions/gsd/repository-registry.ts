// Project/App: GSD-2
// File Purpose: Repository registry seam for parent workspace multi-repo resolution.

import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import type { GSDPreferences, WorkspacePreferences, WorkspaceRepositoryPreference } from "./preferences-types.js";
import { GIT_NO_PROMPT_ENV } from "./git-constants.js";
import { resolveGsdPathContract } from "./paths.js";

export interface RegisteredRepository {
  id: string;
  root: string;
  role?: string;
  verification?: string[];
  commitPolicy?: "auto" | "skip";
}

export interface RepositoryRegistry {
  projectRoot: string;
  mode: "project" | "parent";
  repositories: RegisteredRepository[];
  byId: ReadonlyMap<string, RegisteredRepository>;
}

export function defaultRepositoryTargets(registry: RepositoryRegistry): string[] {
  const project = registry.byId.get("project");
  if (project) return [project.id];
  const first = registry.repositories[0];
  return first ? [first.id] : [];
}


function assertInsideProjectRoot(projectRoot: string, candidateRoot: string, repoId: string): void {
  const rel = relative(projectRoot, candidateRoot);
  if (rel === "") return;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`workspace.repositories.${repoId}.path resolves outside project root: ${candidateRoot}`);
  }
}

function resolveRepositoryRoot(
  projectRoot: string,
  repoId: string,
  repo: WorkspaceRepositoryPreference,
): RegisteredRepository {
  const root = resolve(projectRoot, repo.path);
  assertInsideProjectRoot(projectRoot, root, repoId);
  return {
    id: repoId,
    root,
    role: repo.role,
    verification: repo.verification,
    commitPolicy: repo.commit_policy,
  };
}

function resolveGitWorkingTreeRoot(basePath: string): string | null {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
    }).trim();
    return root ? resolve(root) : null;
  } catch {
    return null;
  }
}

/**
 * Build a repository registry with an implicit reserved "project" repository
 * rooted at projectRoot. User-defined workspace repositories may not use id "project".
 */
export function createRepositoryRegistry(
  basePath: string,
  workspacePrefs?: WorkspacePreferences,
): RepositoryRegistry {
  const contract = resolveGsdPathContract(basePath);
  const projectRoot = resolveGitWorkingTreeRoot(contract.workRoot) ?? contract.projectRoot;
  const mode = workspacePrefs?.mode ?? "project";
  const repoMap = new Map<string, RegisteredRepository>();

  // "project" is reserved: always maps to projectRoot and cannot be overridden.
  repoMap.set("project", { id: "project", root: projectRoot });

  if (workspacePrefs?.repositories && Object.hasOwn(workspacePrefs.repositories, "project")) {
    throw new Error('workspace.repositories.project is reserved for the implicit project root repository');
  }

  for (const [repoId, repoConfig] of Object.entries(workspacePrefs?.repositories ?? {})) {
    repoMap.set(repoId, resolveRepositoryRoot(projectRoot, repoId, repoConfig));
  }

  return {
    projectRoot,
    mode,
    repositories: Array.from(repoMap.values()),
    byId: repoMap,
  };
}

export function createRepositoryRegistryFromPreferences(
  basePath: string,
  preferences?: Pick<GSDPreferences, "workspace">,
): RepositoryRegistry {
  return createRepositoryRegistry(basePath, preferences?.workspace);
}
