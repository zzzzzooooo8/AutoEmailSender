import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RELEASE_COMMIT_PREFIX = "chore(release):";

export function buildReleaseNotes(version, commits) {
  const normalizedVersion = normalizeVersion(version);
  const installerName = `AutoEmailSender-Setup-${normalizedVersion}.exe`;
  const recentUpdates = commits.length
    ? commits.map((commit) => `- ${commit}`).join("\n")
    : "- 本次发布未包含额外的功能提交。";

  return [
    `# ${version}`,
    "",
    "## 最近更新",
    recentUpdates,
    "",
    "## 安装说明",
    `- 普通用户只需下载 \`${installerName}\``,
    "",
    "## 自动更新",
    "- 应用内会自动检查更新。",
    "- 有新版本时，会提示你确认下载并安装。",
    "",
    "## 文件说明",
    "- `latest.yml` 和 `.blockmap` 是自动更新所需文件，不需要手动下载。",
    "",
  ].join("\n");
}

export function generateReleaseNotes({
  repoRoot,
  version,
  outputPath,
  upperRef = "HEAD",
  runGitCommand = runGit,
}) {
  const currentTag = normalizeTag(version);
  const previousTag = getPreviousTag(runGitCommand, repoRoot, upperRef);
  const commits = listCommitSubjects(runGitCommand, repoRoot, previousTag, upperRef);
  const releaseNotes = buildReleaseNotes(currentTag, commits);
  const resolvedOutputPath = isAbsolute(outputPath)
    ? outputPath
    : resolve(process.cwd(), outputPath);

  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, releaseNotes, "utf8");
  return releaseNotes;
}

function listCommitSubjects(runGitCommand, repoRoot, previousTag, upperRef) {
  const range = previousTag ? `${previousTag}..${upperRef}` : upperRef;
  const output = runGitCommand(repoRoot, ["log", "--format=%s", range]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((subject) => !subject.startsWith(RELEASE_COMMIT_PREFIX));
}

function getPreviousTag(runGitCommand, repoRoot, upperRef) {
  try {
    return runGitCommand(repoRoot, [
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      "v*",
      `${upperRef}^`,
    ]);
  } catch {
    return null;
  }
}

function normalizeTag(version) {
  if (version && version.trim()) {
    return version.startsWith("v") ? version : `v${version.trim()}`;
  }
  throw new Error("无法确定当前版本号，请显式传入版本号。");
}

function normalizeVersion(version) {
  return version.replace(/^v/, "");
}

function runGit(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

function main() {
  const { repoRoot, version, outputPath, upperRef } = parseArgs(process.argv.slice(2));
  generateReleaseNotes({ repoRoot, version, outputPath, upperRef });
}

function parseArgs(argv) {
  let repoRoot = process.cwd();
  let version = "";
  let outputPath = "release-notes.md";
  let upperRef = "HEAD";

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--repo-root") {
      repoRoot = resolve(argv[++index] ?? repoRoot);
      continue;
    }
    if (value === "--version") {
      version = argv[++index] ?? version;
      continue;
    }
    if (value === "--output") {
      outputPath = argv[++index] ?? outputPath;
      continue;
    }
    if (value === "--upper-ref") {
      upperRef = argv[++index] ?? upperRef;
      continue;
    }
  }

  return { repoRoot, version, outputPath, upperRef };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
