#!/usr/bin/env node
/**
 * Sync pkg/package.json version with the installed @mariozechner/pi-coding-agent version.
 *
 * gsd-pi sets PI_PACKAGE_DIR=pkg/ so that pi's config.js reads piConfig from
 * pkg/package.json (for branding: name="gsd", configDir=".gsd"). However, config.js
 * also reads `version` from that same file and uses it for the update check
 * (comparing against npm registry). If pkg/package.json has a stale version,
 * pi's update banner fires even when the user is already on the latest release.
 *
 * This script reads the actual installed pi-coding-agent version and writes it
 * into pkg/package.json so VERSION is always correct at publish time.
 */
const { readFileSync, writeFileSync } = require('fs')
const { resolve, join } = require('path')

const root = resolve(__dirname, '..')
const piPkgPath = join(root, 'packages', 'pi-coding-agent', 'package.json')
const gsdPkgPath = join(root, 'pkg', 'package.json')

const piPkg = JSON.parse(readFileSync(piPkgPath, 'utf-8'))
const gsdPkg = JSON.parse(readFileSync(gsdPkgPath, 'utf-8'))

if (gsdPkg.version !== piPkg.version) {
  console.log(`[sync-pkg-version] Updating pkg/package.json version: ${gsdPkg.version} → ${piPkg.version}`)
  gsdPkg.version = piPkg.version
  writeFileSync(gsdPkgPath, JSON.stringify(gsdPkg, null, 2) + '\n')
} else {
  console.log(`[sync-pkg-version] pkg/package.json version already matches: ${piPkg.version}`)
}
