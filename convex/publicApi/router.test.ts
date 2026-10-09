import { expect, test } from "vitest";
import { matchPath } from "./router";

test("a {name} segment matches one URL-decoded segment", () => {
  expect(matchPath("/v1/forms/{form_id}/submissions", "/v1/forms/k17%20x/submissions")).toEqual({ form_id: "k17 x" });
  expect(matchPath("/v1/forms", "/v1/forms/")).toEqual({});
  expect(matchPath("/v1/forms/{form_id}", "/v1/forms/")).toBeNull();
  expect(matchPath("/v1/forms/{form_id}", "/v1/forms/a/b")).toBeNull();
  expect(matchPath("/v1/forms", "/v1/formsx")).toBeNull();
});
