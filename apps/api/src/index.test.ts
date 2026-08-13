import { describe, expect, it } from "vitest";
import { buildAccessVerifierConfig } from "./index.js";

describe("buildAccessVerifierConfig", () => {
  it("disables Worker-side JWT verification when Access env is fully unset", () => {
    expect(buildAccessVerifierConfig({})).toEqual({ kind: "disabled" });
  });

  it("fails closed when only one Cloudflare Access env var is configured", () => {
    expect(
      buildAccessVerifierConfig({ CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" }),
    ).toEqual({
      kind: "error",
      detail: "CF_ACCESS_TEAM_DOMAIN と CF_ACCESS_AUD は両方設定してください。",
    });
    expect(buildAccessVerifierConfig({ CF_ACCESS_AUD: "audience" })).toEqual({
      kind: "error",
      detail: "CF_ACCESS_TEAM_DOMAIN と CF_ACCESS_AUD は両方設定してください。",
    });
  });

  it("enables verification only when both Access env vars are present", () => {
    const result = buildAccessVerifierConfig({
      CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CF_ACCESS_AUD: "audience",
    });

    expect(result.kind).toBe("enabled");
  });
});
