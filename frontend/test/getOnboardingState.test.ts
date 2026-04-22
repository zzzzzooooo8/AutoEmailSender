import { describe, expect, it } from "vitest";
import { getOnboardingState } from "@/features/onboarding/client/getOnboardingState";

describe("getOnboardingState", () => {
  it("returns identity onboarding state when no identity exists", () => {
    expect(
      getOnboardingState({
        hasIdentity: false,
        hasLlmProfile: false,
        hasPrimaryMaterial: false,
        hasProfessors: false,
        hasFirstTask: false,
      }),
    ).toMatchObject({
      stage: "identity",
      title: expect.any(String),
      description: expect.any(String),
      completed: false,
      nextActionHref: "/profile",
    });
  });

  it("returns professors onboarding state when the base setup is ready but there are no professors", () => {
    expect(
      getOnboardingState({
        hasIdentity: true,
        hasLlmProfile: true,
        hasPrimaryMaterial: true,
        hasProfessors: false,
        hasFirstTask: false,
      }),
    ).toMatchObject({
      stage: "professors",
      title: expect.any(String),
      description: expect.any(String),
      completed: false,
      nextActionHref: "/professors",
    });
  });
});
