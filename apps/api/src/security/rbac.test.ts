import { describe, expect, it } from "vitest";
import { hasRole, parseGroupList, roleFromGroups, type RbacConfig } from "./rbac.js";

const CONFIG: RbacConfig = {
  analystGroups: ["grp-analyst"],
  dataAdminGroups: ["grp-data"],
  adminGroups: ["grp-admin"],
};

describe("parseGroupList", () => {
  it("parses comma-separated group ids", () => {
    expect(parseGroupList("grp-a, grp-b ,grp-c")).toEqual(["grp-a", "grp-b", "grp-c"]);
  });

  it("returns an empty list for undefined or blank input", () => {
    expect(parseGroupList(undefined)).toEqual([]);
    expect(parseGroupList("")).toEqual([]);
    expect(parseGroupList("  , ")).toEqual([]);
  });
});

describe("roleFromGroups", () => {
  it("maps a matching admin group to system-admin", () => {
    expect(roleFromGroups(["grp-admin", "grp-analyst"], CONFIG)).toBe("system-admin");
  });

  it("maps a data-admin group before analyst", () => {
    expect(roleFromGroups(["grp-data"], CONFIG)).toBe("data-admin");
  });

  it("maps an analyst group to analyst", () => {
    expect(roleFromGroups(["grp-analyst"], CONFIG)).toBe("analyst");
  });

  it("falls back to viewer when no group matches or groups are missing", () => {
    expect(roleFromGroups(["unknown-group"], CONFIG)).toBe("viewer");
    expect(roleFromGroups(undefined, CONFIG)).toBe("viewer");
    expect(roleFromGroups([], CONFIG)).toBe("viewer");
  });
});

describe("hasRole", () => {
  it("enforces the role hierarchy", () => {
    expect(hasRole("viewer", "viewer")).toBe(true);
    expect(hasRole("viewer", "analyst")).toBe(false);
    expect(hasRole("analyst", "viewer")).toBe(true);
    expect(hasRole("system-admin", "data-admin")).toBe(true);
    expect(hasRole("system-admin", "system-admin")).toBe(true);
    expect(hasRole("analyst", "system-admin")).toBe(false);
  });
});
