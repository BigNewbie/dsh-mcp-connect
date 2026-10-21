#!/usr/bin/env node
/**
 * Point this package at your GitHub account before pushing.
 *
 *   node scripts/set-owner.mjs <github-owner> [repo]
 *
 * Writes package.json repository/homepage/bugs, rewrites the YOUR_GITHUB
 * placeholder in both READMEs, and sets `origin`.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const [owner, repoArg] = process.argv.slice(2)
if (!owner) {
  console.error('usage: node scripts/set-owner.mjs <github-owner> [repo]')
  process.exit(1)
}
const repo = repoArg || 'dsh-mcp-connect'
const base = `https://github.com/${owner}/${repo}`

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
pkg.repository = { type: 'git', url: `git+${base}.git` }
pkg.homepage = base
pkg.bugs = { url: `${base}/issues` }
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

for (const file of ['README.md', 'README.en.md']) {
  const text = await readFile(file, 'utf8')
  await writeFile(file, text.replaceAll('YOUR_GITHUB/dsh-mcp-connect', `${owner}/${repo}`))
}

try {
  execFileSync('git', ['remote', 'remove', 'origin'], { stdio: 'ignore' })
} catch {
  /* no origin yet */
}
execFileSync('git', ['remote', 'add', 'origin', `${base}.git`], { stdio: 'inherit' })
console.log(`owner set to ${owner}/${repo}`)
console.log(`origin -> ${base}.git`)
console.log('next: git add -A && git commit -m "chore: set repository owner" && git push -u origin main')
