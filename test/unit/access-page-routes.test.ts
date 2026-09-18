import { describe, expect, it } from "vitest";
import { accessLegacyRedirectPath, queryParam } from "@/lib/access-routes";

describe("accessLegacyRedirectPath", () => {
  it("maps section query params to administration pages", () => {
    expect(accessLegacyRedirectPath("organizations")).toEqual({
      pathname: "/admin/settings/organizations",
    });
    expect(accessLegacyRedirectPath("sharing")).toEqual({
      pathname: "/admin/settings/sharing",
    });
    expect(accessLegacyRedirectPath("limits")).toEqual({
      pathname: "/admin/settings/limits",
    });
  });

  it("maps tab query params to people, teams, roles and resources", () => {
    expect(accessLegacyRedirectPath(undefined, "teams")).toEqual({
      pathname: "/members/teams",
    });
    expect(accessLegacyRedirectPath("access", "roles")).toEqual({
      pathname: "/members/roles",
    });
    expect(accessLegacyRedirectPath(undefined, "resources")).toEqual({
      pathname: "/members/resources",
    });
  });

  it("keeps the people page for default access params", () => {
    expect(accessLegacyRedirectPath()).toBeNull();
    expect(accessLegacyRedirectPath("access")).toBeNull();
    expect(accessLegacyRedirectPath("access", "access")).toBeNull();
    expect(accessLegacyRedirectPath(undefined, "access")).toBeNull();
  });

  it("prefers section over tab when both are set", () => {
    expect(accessLegacyRedirectPath("organizations", "teams")).toEqual({
      pathname: "/admin/settings/organizations",
    });
  });

  it("ignores unknown values", () => {
    expect(accessLegacyRedirectPath("unknown")).toBeNull();
    expect(accessLegacyRedirectPath(undefined, "unknown")).toBeNull();
  });
});

describe("queryParam", () => {
  it("returns a single string value", () => {
    expect(queryParam("teams")).toBe("teams");
    expect(queryParam(["teams"])).toBeUndefined();
    expect(queryParam(undefined)).toBeUndefined();
  });
});
