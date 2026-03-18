import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface MarketplaceFixtureSet {
  claudeSkillsPath: string;
  claudePluginsOfficialPath: string;
  source: 'local' | 'cloned';
  cleanup: () => void;
}

const CLAUDE_SKILLS_REPO = 'https://github.com/Jamie-BitFlight/claude_skills.git';
const CLAUDE_PLUGINS_OFFICIAL_REPO = 'https://github.com/Jamie-BitFlight/claude-plugins-official.git';
const CLONE_FIXTURES_ENABLED = process.env.GSD_TEST_CLONE_MARKETPLACES === '1';

function canRunGit(): boolean {
  const result = spawnSync('git', ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

function cloneRepo(repo: string, dest: string): void {
  const result = spawnSync('git', ['clone', '--depth', '1', repo, dest], {
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 120000,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || '').trim();
    throw new Error(`git clone failed for ${repo}: ${stderr}`);
  }
}

export function getMarketplaceFixtures(testFileDir: string): { available: boolean; skipReason?: string; fixtures?: MarketplaceFixtureSet } {
  const gsd2Root = resolve(testFileDir, '../../../../..');
  const localClaudeSkillsPath = resolve(gsd2Root, '../claude_skills');
  const localClaudePluginsOfficialPath = resolve(gsd2Root, '../claude-plugins-official');

  if (existsSync(localClaudeSkillsPath) && existsSync(localClaudePluginsOfficialPath)) {
    return {
      available: true,
      fixtures: {
        claudeSkillsPath: localClaudeSkillsPath,
        claudePluginsOfficialPath: localClaudePluginsOfficialPath,
        source: 'local',
        cleanup: () => {},
      },
    };
  }

  if (!CLONE_FIXTURES_ENABLED) {
    return {
      available: false,
      skipReason: 'Marketplace repos absent and clone-based fixtures are disabled (set GSD_TEST_CLONE_MARKETPLACES=1 to enable)',
    };
  }

  if (!canRunGit()) {
    return {
      available: false,
      skipReason: 'Marketplace repos absent and git is unavailable for cloning test fixtures',
    };
  }

  try {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'gsd-marketplace-fixtures-'));
    const clonedClaudeSkillsPath = join(fixtureRoot, 'claude_skills');
    const clonedClaudePluginsOfficialPath = join(fixtureRoot, 'claude-plugins-official');

    cloneRepo(CLAUDE_SKILLS_REPO, clonedClaudeSkillsPath);
    cloneRepo(CLAUDE_PLUGINS_OFFICIAL_REPO, clonedClaudePluginsOfficialPath);

    return {
      available: true,
      fixtures: {
        claudeSkillsPath: clonedClaudeSkillsPath,
        claudePluginsOfficialPath: clonedClaudePluginsOfficialPath,
        source: 'cloned',
        cleanup: () => {
          rmSync(fixtureRoot, { recursive: true, force: true });
        },
      },
    };
  } catch (error) {
    return {
      available: false,
      skipReason: error instanceof Error ? error.message : String(error),
    };
  }
}
