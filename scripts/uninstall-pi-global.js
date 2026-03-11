#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const resourcesDir = resolve(__dirname, '..', 'src', 'resources')
const piRoot = join(os.homedir(), '.pi')
const piAgentDir = join(piRoot, 'agent')

const removed = []
const skipped = []

function safeRemove(path, label) {
  if (!existsSync(path)) return
  rmSync(path, { recursive: true, force: true })
  removed.push(label)
}

function removeResourceEntries(containerName) {
  const srcDir = join(resourcesDir, containerName)
  const destDir = join(piAgentDir, containerName)
  if (!existsSync(srcDir) || !existsSync(destDir)) return

  for (const entry of readdirSync(srcDir)) {
    safeRemove(join(destDir, entry), `${containerName}/${entry}`)
  }

  try {
    if (readdirSync(destDir).length === 0) {
      rmdirSync(destDir)
      removed.push(`${containerName}/`)
    }
  } catch {
    // ignore non-empty or missing dirs
  }
}

function removeIfContentMatches(targetPath, sourcePath, label) {
  if (!existsSync(targetPath) || !existsSync(sourcePath)) return
  try {
    const target = readFileSync(targetPath, 'utf8')
    const source = readFileSync(sourcePath, 'utf8')
    if (target === source) {
      rmSync(targetPath, { force: true })
      removed.push(label)
    } else {
      skipped.push(`${label} (modified, left in place)`)
    }
  } catch {
    skipped.push(`${label} (could not verify, left in place)`)
  }
}

removeResourceEntries('extensions')
removeResourceEntries('skills')
removeResourceEntries('agents')
removeIfContentMatches(join(piAgentDir, 'AGENTS.md'), join(resourcesDir, 'AGENTS.md'), 'agent/AGENTS.md')
removeIfContentMatches(join(piRoot, 'GSD-WORKFLOW.md'), join(resourcesDir, 'GSD-WORKFLOW.md'), 'GSD-WORKFLOW.md')

process.stdout.write(
  `Removed GSD resources from ${piRoot}\n` +
  `Removed: ${removed.length ? removed.join(', ') : '(nothing)'}\n` +
  (skipped.length ? `Skipped: ${skipped.join(', ')}\n` : '')
)
