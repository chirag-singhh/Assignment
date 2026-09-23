import { expect, it } from "vitest";
import { hidePropertyIds } from "./assistantText.js";

it("removes internal property identifiers from assistant text", () => {
  const result = hidePropertyIds([
    "Properties:",
    "- P007: Golf Course Road — Commercial Office",
    "- Property ID: cmue89kev000ll92er7c0lidn",
    "Updated Golf Course Road (P007).",
  ].join("\n"));
  expect(result).toContain("Golf Course Road");
  expect(result).not.toMatch(/P007|cmue89kev000ll92er7c0lidn|Property ID/i);
});
