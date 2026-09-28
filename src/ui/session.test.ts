import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toWorkout } from "matrix-workouts-core";

// The Keychain, as a Map. `session.ts` is the only thing that touches it.
const keychain = new Map<string, string>();
vi.mock("expo-secure-store", () => ({
  setItemAsync: async (key: string, value: string) => void keychain.set(key, value),
  getItemAsync: async (key: string) => keychain.get(key) ?? null,
  deleteItemAsync: async (key: string) => void keychain.delete(key),
}));

const FIXTURES = join(__dirname, "../../fixtures");
const raw = readdirSync(FIXTURES)
  .filter((f) => f.startsWith("raw-") && f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) as Record<string, unknown>);
const bikeIds = raw.map((r) => toWorkout(r).id);

// Out of scope for export; the list must not offer it.
const treadmill = { ...raw[0], workoutId: "treadmill-ride", machineType: "treadmill" };
const treadmillId = toWorkout(treadmill).id;

type Reply = { status: number; body?: unknown };
let replies: Reply[];
let requests: { url: string; body?: string }[];

// `session.ts` hands RN's global fetch to core, so that is what the tests replace.
vi.stubGlobal("fetch", async (url: string, init: { body?: string }) => {
  requests.push({ url, body: init.body });
  const reply = replies.shift();
  if (!reply) throw new Error(`unexpected request to ${url}`);
  return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
});

const LOGIN: Reply = {
  status: 200,
  // The real response is a full profile. Only `id` and `token` may leave core.
  body: { id: "ex-1", token: "tok-1", email: "rider@example.com", firstName: "Rider", weight: 80 },
};
const HISTORY: Reply = { status: 200, body: { workouts: [...raw, treadmill] } };

/** A fresh module each time: the history cache is module state. */
async function session() {
  vi.resetModules();
  return import("./session");
}

beforeEach(() => {
  keychain.clear();
  replies = [];
  requests = [];
});

describe("signIn", () => {
  it("keeps the exerciser id and token, and nothing else", async () => {
    const s = await session();
    replies.push(LOGIN);
    await s.signIn("12345", "9876");
    const stored = [...keychain.values()];
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0]!)).toEqual({ exerciserId: "ex-1", token: "tok-1" });
    expect(stored[0]).not.toContain("9876");
    expect(stored[0]).not.toContain("rider@example.com");
    expect(await s.storedCredentials()).toEqual({ exerciserId: "ex-1", token: "tok-1" });
  });

  it("stores nothing when the passcode is refused", async () => {
    const s = await session();
    replies.push({ status: 401 });
    await expect(s.signIn("12345", "0000")).rejects.toThrow();
    expect(keychain.size).toBe(0);
  });
});

describe("storedCredentials", () => {
  it("treats a damaged keychain entry as signed out", async () => {
    const s = await session();
    for (const junk of ["not json", "{}", '{"token":"t"}', '{"exerciserId":"e"}']) {
      keychain.clear();
      keychain.set("matrix-credentials", junk);
      expect(await s.storedCredentials()).toBeNull();
    }
  });
});

describe("loadRides", () => {
  const credentials = { exerciserId: "ex-1", token: "tok-1" };

  it("offers bike rides only", async () => {
    const s = await session();
    replies.push(HISTORY);
    const { workouts } = await s.loadRides(credentials);
    expect(workouts.map((w) => w.id).sort()).toEqual([...bikeIds].sort());
    expect(workouts.some((w) => w.id === treadmillId)).toBe(false);
  });

  it("makes one request until asked to refresh", async () => {
    const s = await session();
    replies.push(HISTORY, HISTORY);
    await s.loadRides(credentials);
    await s.loadRides(credentials);
    expect(requests).toHaveLength(1);
    await s.loadRides(credentials, true);
    expect(requests).toHaveLength(2);
  });

  for (const status of [401, 403]) {
    it(`signs out on ${status} and says so in the app's own words`, async () => {
      const s = await session();
      keychain.set("matrix-credentials", JSON.stringify(credentials));
      replies.push({ status });
      const error = await s.loadRides(credentials).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(s.SessionExpired);
      // Core's message is written for the extension and tells you to reload the site.
      expect((error as Error).message).not.toMatch(/site/i);
      expect(keychain.size).toBe(0);
    });
  }

  it("keeps the sign-in through a server failure", async () => {
    const s = await session();
    keychain.set("matrix-credentials", JSON.stringify(credentials));
    replies.push({ status: 503 });
    const error = await s.loadRides(credentials).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(s.SessionExpired);
    expect(keychain.size).toBe(1);
  });
});

describe("loadRide", () => {
  it("fetches the history on a cold start instead of showing nothing", async () => {
    const s = await session();
    keychain.set("matrix-credentials", JSON.stringify({ exerciserId: "ex-1", token: "tok-1" }));
    replies.push(HISTORY);
    expect((await s.loadRide(bikeIds[0]!))?.id).toBe(bikeIds[0]);
    // The second lookup is served from memory.
    expect((await s.loadRide(bikeIds[1]!))?.id).toBe(bikeIds[1]);
    expect(requests).toHaveLength(1);
  });

  it("does not offer a ride outside the scope wall, even by id", async () => {
    const s = await session();
    keychain.set("matrix-credentials", JSON.stringify({ exerciserId: "ex-1", token: "tok-1" }));
    replies.push(HISTORY);
    expect(await s.loadRide(treadmillId)).toBeNull();
    expect(await s.loadRide("no-such-ride")).toBeNull();
  });

  it("is null when signed out, without a request", async () => {
    const s = await session();
    expect(await s.loadRide(bikeIds[0]!)).toBeNull();
    expect(requests).toHaveLength(0);
  });
});
