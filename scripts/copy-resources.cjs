#!/usr/bin/env node
const { cpSync, rmSync } = require('fs');
rmSync('dist/resources', { recursive: true, force: true });
cpSync('src/resources', 'dist/resources', { recursive: true, force: true });
