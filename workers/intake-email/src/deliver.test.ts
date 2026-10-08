import { expect, test, vi } from "vitest";
import { type Delivery, deliver } from "./deliver";
import type { Plan } from "./map";

const plan: Plan = {
  token: "tok",
  from: "a@b.test",
  subject: "Facturen",
  date: "",
  body: "Zie bijlage",
  bodyTooLarge: false,
  store: [
    { key: "intake/1", bytes: new Uint8Array([1]), mimeType: "application/pdf" },
    { key: "intake/2", bytes: new Uint8Array([2]), mimeType: "image/png" },
  ],
  entries: [
    { key: "intake/1", filename: "a.pdf", mimeType: "application/pdf" },
    { key: "intake/2", filename: "b.png", mimeType: "image/png" },
  ],
};

/** An R2 and a Vink that remember what happened; `send` answers as the test says. */
function fakes(send: Delivery["send"]) {
  const stored = new Set<string>();
  const delivery: Delivery = {
    put: vi.fn(async (key) => {
      stored.add(key);
    }),
    remove: vi.fn(async (keys) => {
      for (const key of keys) stored.delete(key);
    }),
    send: vi.fn(send),
  };
  return { stored, delivery };
}

test("an accepted mail keeps its files in R2 and sends the plan as it is", async () => {
  const { stored, delivery } = fakes(async () => ({ status: 200, ok: true }));
  expect(await deliver(plan, 1_000, delivery)).toBe("accepted");
  expect([...stored]).toEqual(["intake/1", "intake/2"]);
  expect(delivery.remove).not.toHaveBeenCalled();
  expect(JSON.parse(vi.mocked(delivery.send).mock.calls[0][0])).toMatchObject({
    token: "tok",
    receivedAt: 1_000,
    attachments: plan.entries,
  });
});

test("when Vink cannot be reached, the error goes on and the files stay (Vink may have committed them)", async () => {
  const { stored, delivery } = fakes(async () => {
    throw new TypeError("fetch failed");
  });
  await expect(deliver(plan, 1, delivery)).rejects.toThrow("fetch failed");
  expect(stored.size).toBe(plan.store.length);
});

test("when Vink answers with an error, the sender retries and the Worker leaves the clean-up to Vink", async () => {
  const { stored, delivery } = fakes(async () => ({ status: 400, ok: false }));
  await expect(deliver(plan, 1, delivery)).rejects.toThrow("Vink answered 400");
  expect(stored.size).toBe(plan.store.length);
});

test("an unknown address is bounced and leaves no files", async () => {
  const { stored, delivery } = fakes(async () => ({ status: 404, ok: false }));
  expect(await deliver(plan, 1, delivery)).toBe("unknown_address");
  expect(stored.size).toBe(0);
});

test("when storing fails halfway, what was stored is removed and Vink is not called", async () => {
  const { stored, delivery } = fakes(async () => ({ status: 200, ok: true }));
  vi.mocked(delivery.put).mockImplementationOnce(async (key) => {
    stored.add(key);
  });
  vi.mocked(delivery.put).mockImplementationOnce(async () => {
    throw new Error("R2 down");
  });
  await expect(deliver(plan, 1, delivery)).rejects.toThrow("R2 down");
  expect(stored.size).toBe(0);
  expect(delivery.send).not.toHaveBeenCalled();
});

test("a failing clean-up does not hide the real error", async () => {
  const { delivery } = fakes(async () => ({ status: 500, ok: false }));
  vi.mocked(delivery.remove).mockRejectedValueOnce(new Error("R2 also down"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(deliver(plan, 1, delivery)).rejects.toThrow("Vink answered 500");
});

test("a mail with no attachments has nothing to remove", async () => {
  const { delivery } = fakes(async () => ({ status: 500, ok: false }));
  await expect(deliver({ ...plan, store: [], entries: [] }, 1, delivery)).rejects.toThrow();
  expect(delivery.remove).not.toHaveBeenCalled();
});
