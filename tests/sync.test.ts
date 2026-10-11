import { describe, it, expect } from "vitest";
import { encryptRows, decryptRows, mergeRows, idFor } from "../src/journal/sync";
const row = (id: string, updated: number, notes = "") => ({ id, updated, notes } as any);
describe("journal sync (E2E encrypted)", () => {
  it("round-trips, id is passphrase-derived hex and independent of content", async () => {
    const e = await encryptRows("correct horse battery", [row("a", 1, "secret note")]);
    expect(e.id).toMatch(/^[0-9a-f]{64}$/); expect(e.id).toBe(await idFor("correct horse battery")); expect(e.blob).not.toContain("secret");
    expect((await decryptRows("correct horse battery", e.iv, e.blob))[0].notes).toBe("secret note");
    await expect(decryptRows("wrong passphrase!!", e.iv, e.blob)).rejects.toBeTruthy();
  });
  it("merge: newer updated wins per row, union of rows", () => {
    const m = mergeRows([row("a", 5, "local"), row("b", 1)], [row("a", 3, "remote"), row("c", 2)]);
    expect(m.find((r) => r.id === "a")!.notes).toBe("local"); expect(m.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
    expect(mergeRows([row("a", 1, "old")], [row("a", 9, "new")])[0].notes).toBe("new");
  });
});
