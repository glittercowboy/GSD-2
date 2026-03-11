#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const resourcesDir = resolve(__dirname, '..', 'src', 'resources')
const piRoot = join(os.homedir(), '.pi')
const piAgentDir = join(piRoot, 'agent')

const copyDir = (name) => {
  const src = join(resourcesDir, name)
  const dest = join(piAgentDir, name)
  if (!existsSync(src)) return false
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, force: true })
  return true
}

mkdirSync(piAgentDir, { recursive: true })

const copied = []
if (copyDir('extensions')) copied.push('extensions')
if (copyDir('skills')) copied.push('skills')
if (copyDir('agents')) copied.push('agents')

const agentsMdSrc = join(resourcesDir, 'AGENTS.md')
if (existsSync(agentsMdSrc)) {
  writeFileSync(join(piAgentDir, 'AGENTS.md'), readFileSync(agentsMdSrc))
  copied.push('AGENTS.md')
}

const workflowSrc = join(resourcesDir, 'GSD-WORKFLOW.md')
if (existsSync(workflowSrc)) {
  writeFileSync(join(piRoot, 'GSD-WORKFLOW.md'), readFileSync(workflowSrc))
  copied.push('GSD-WORKFLOW.md')
}

process.stdout.write(
  `Installed GSD resources for pi in ${piRoot}\n` +
  `Copied: ${copied.join(', ')}\n` +
  `Extensions are now available under ${join(piAgentDir, 'extensions')}\n`
)
