import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const profilePageSource = readFileSync(
  resolve(process.cwd(), "src/pages/ProfilePage.tsx"),
  "utf8",
);

const getSectionSource = (sectionId: string, nextSectionId?: string) => {
  const start = profilePageSource.indexOf(`sectionId="${sectionId}"`);
  expect(start).toBeGreaterThanOrEqual(0);

  if (!nextSectionId) {
    return profilePageSource.slice(start);
  }

  const end = profilePageSource.indexOf(`sectionId="${nextSectionId}"`, start);
  expect(end).toBeGreaterThan(start);
  return profilePageSource.slice(start, end);
};

describe("ProfilePage setup sections", () => {
  it("keeps identity save actions in the sender identity section", () => {
    const identitySection = getSectionSource("identity", "materials");
    const testSection = getSectionSource("test");

    expect(identitySection).toContain("{identityActionButtons}");
    expect(testSection).not.toContain("保存配置");
    expect(testSection).not.toContain("{identityActionButtons}");
  });

  it("saves identity changes when completing template editing", () => {
    const modalSource = profilePageSource.slice(
      profilePageSource.indexOf("const OutreachTemplateModal = ({"),
      profilePageSource.indexOf("const MaterialLibraryModal = ({"),
    );

    expect(modalSource).toContain("savingTemplate");
    expect(modalSource).toContain("onComplete");
    expect(modalSource).toContain("onClick={onComplete}");
    expect(modalSource).not.toContain("保存身份后生效。");

    const modalUsageSource = profilePageSource.slice(
      profilePageSource.indexOf("<OutreachTemplateModal"),
    );
    expect(modalUsageSource).toContain("savingTemplate={submittingIdentity}");
    expect(modalUsageSource).toContain("onComplete={() =>");
    expect(modalUsageSource).toContain(
      "saveIdentity({ validateTemplate: true }).then((saved) =>",
    );
  });

  it("uses the draft llm payload for preview actions", () => {
    expect(profilePageSource).toContain("fetchLLMProfileModelsPreview");
    expect(profilePageSource).toContain("testLLMProfilePreview");
    expect(profilePageSource).toContain("toLLMPayload(llmForm)");
  });
});
