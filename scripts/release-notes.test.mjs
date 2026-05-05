import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReleaseNotes, generateReleaseNotes } from "./release-notes.mjs";

describe("release notes generator", () => {
  it("combines template text with recent commit subjects", () => {
    const notes = buildReleaseNotes("v2.0.2", [
      "fix(后端): 修复桌面路径断言兼容性",
      "test(前端): 修复时间断言时区依赖",
    ]);

    expect(notes).toContain("# v2.0.2");
    expect(notes).toContain("普通用户只需下载 `AutoEmailSender-Setup-2.0.2.exe`");
    expect(notes).toContain("- fix(后端): 修复桌面路径断言兼容性");
    expect(notes).toContain("- test(前端): 修复时间断言时区依赖");
    expect(notes).toContain("latest.yml");
  });

  it("writes notes to disk when asked", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "auto-email-sender-release-"));
    try {
      const outputPath = join(repoRoot, "release-notes.md");
      const notes = generateReleaseNotes({
        repoRoot,
        version: "v1.2.3",
        outputPath,
        upperRef: "HEAD",
        runGitCommand: (_repoRoot, args) => {
          if (args[0] === "describe") {
            expect(args.at(-1)).toBe("HEAD^");
            return "v1.2.2";
          }
          if (args[0] === "log") {
            expect(args).toEqual(["log", "--format=%s", "v1.2.2..HEAD"]);
            return [
              "chore(release): v1.2.3",
              "fix(后端): 修复桌面路径断言兼容性",
            ].join("\n");
          }
          throw new Error(`unexpected git args: ${args.join(" ")}`);
        },
      });

      expect(notes).toContain("# v1.2.3");
      expect(notes).toContain("- fix(后端): 修复桌面路径断言兼容性");
      expect(notes).not.toContain("chore(release): v1.2.3");
      expect(readFileSync(outputPath, "utf8")).toBe(notes);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("falls back to a no-extra-commits note when only the release commit is present", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "auto-email-sender-release-"));
    try {
      const outputPath = join(repoRoot, "release-notes.md");
      const notes = generateReleaseNotes({
        repoRoot,
        version: "v1.2.3",
        outputPath,
        runGitCommand: (_repoRoot, args) => {
          if (args[0] === "describe") {
            expect(args.at(-1)).toBe("HEAD^");
            return "v1.2.2";
          }
          if (args[0] === "log") {
            return [
              "chore(release): v1.2.3",
            ].join("\n");
          }
          throw new Error(`unexpected git args: ${args.join(" ")}`);
        },
      });

      expect(notes).toContain("本次发布未包含额外的功能提交");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
