#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { argv, exit, stdout } from 'node:process';

const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

const fail = (msg) => {
  stdout.write(`\x1b[31merror:\x1b[0m ${msg}\n`);
  exit(1);
};

const arg = argv[2];
if (!arg) {
  fail('usage: pnpm release <patch|minor|major|x.y.z>');
}

try {
  sh('git rev-parse --is-inside-work-tree');
} catch {
  fail('not inside a git repository');
}

const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'master' && branch !== 'main') {
  fail(`releases must be cut from master/main (current: ${branch})`);
}

if (sh('git status --porcelain')) {
  fail('working tree is dirty — commit or stash first');
}

sh('git fetch --tags --force origin', { stdio: 'inherit' });
const localHead = sh('git rev-parse @');
const remoteHead = sh(`git rev-parse origin/${branch}`);
if (localHead !== remoteHead) {
  fail(`local ${branch} is not in sync with origin/${branch}`);
}

const lastTag = (() => {
  try {
    return sh('git describe --tags --abbrev=0 --match "v[0-9]*"');
  } catch {
    return null;
  }
})();

const baseVersion = lastTag ? lastTag.replace(/^v/, '') : '0.0.0';
const [maj, min, pat] = baseVersion.split('.').map((n) => parseInt(n, 10));
if ([maj, min, pat].some((n) => Number.isNaN(n))) {
  fail(`could not parse last tag '${lastTag}' as semver`);
}

const next = (() => {
  if (arg === 'patch') return `${maj}.${min}.${pat + 1}`;
  if (arg === 'minor') return `${maj}.${min + 1}.0`;
  if (arg === 'major') return `${maj + 1}.0.0`;
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  fail(`invalid bump '${arg}' — use patch|minor|major or explicit x.y.z`);
})();

const tag = `v${next}`;

const existing = sh(`git tag -l ${tag}`);
if (existing) {
  fail(`tag ${tag} already exists locally`);
}

const remoteTags = sh(`git ls-remote --tags origin refs/tags/${tag}`);
if (remoteTags) {
  fail(`tag ${tag} already exists on origin`);
}

stdout.write(`\x1b[36m→\x1b[0m base: ${lastTag ?? '(none)'}  next: ${tag}\n`);

const commits = lastTag
  ? sh(`git log ${lastTag}..HEAD --pretty=format:%s`)
  : sh('git log --pretty=format:%s');
if (!commits) {
  fail(`no commits since ${lastTag} — nothing to release`);
}
stdout.write(`\x1b[36m→\x1b[0m ${commits.split('\n').length} commits since ${lastTag ?? 'beginning'}\n`);

sh(`git tag -a ${tag} -m "release ${tag}"`, { stdio: 'inherit' });
sh(`git push origin ${tag}`, { stdio: 'inherit' });

stdout.write(`\x1b[32m✓\x1b[0m pushed ${tag} — CI will build artifacts and publish the GitHub release\n`);
