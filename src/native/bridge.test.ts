import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toWorkout, workoutExport } from "matrix-workouts-core";
import { mapWorkout } from "../map/workout";

/**
 * The bridge has two sides that no compiler checks against each other: the payload
 * `map/` builds in TypeScript, and the `Record` structs the Swift module decodes it
 * into. Expo fills a `@Field` it cannot find with its default, silently — so a
 * renamed key does not fail, it writes a workout starting at 1970 with no samples.
 * This reads the Swift source and holds the two to the same shape. It is a text
 * check, not a compile; it exists because CI's Xcode build cannot see this mismatch
 * either.
 */

const SWIFT = readFileSync(join(__dirname, "../../modules/health-write/ios/HealthWriteModule.swift"), "utf8");
const BRIDGE = readFileSync(join(__dirname, "healthWrite.ts"), "utf8");

type Field = { name: string; type: string };

function records(source: string): Map<string, Field[]> {
  const out = new Map<string, Field[]>();
  for (const [, name, body] of source.matchAll(/struct (\w+): Record \{([^}]*)\}/g)) {
    const fields = [...body!.matchAll(/@Field var (\w+): ([\w?\[\]]+)/g)].map(([, n, t]) => ({ name: n!, type: t! }));
    out.set(name!, fields);
  }
  return out;
}

const structs = records(SWIFT);

/** Does a JSON value decode into this Swift field type? */
function fits(swiftType: string, value: unknown): boolean {
  if (swiftType.endsWith("?")) return value === null || fits(swiftType.slice(0, -1), value);
  switch (swiftType) {
    case "Double":
      return typeof value === "number" && Number.isFinite(value);
    case "Int":
      return Number.isInteger(value);
    case "Bool":
      return typeof value === "boolean";
    case "String":
      return typeof value === "string";
  }
  const array = /^\[(\w+)\]$/.exec(swiftType);
  if (array) return Array.isArray(value) && value.every((v) => fits(array[1]!, v));
  const nested = structs.get(swiftType);
  if (nested) return typeof value === "object" && value !== null && conforms(swiftType, value as Record<string, unknown>).length === 0;
  throw new Error(`the test does not know Swift type ${swiftType}`);
}

/** Every mismatch between a JS object and the Swift struct it decodes into. */
function conforms(struct: string, value: Record<string, unknown>): string[] {
  const fields = structs.get(struct);
  if (!fields) return [`no Swift struct ${struct}`];
  const problems: string[] = [];
  const names = new Set(fields.map((f) => f.name));
  for (const key of Object.keys(value)) if (!names.has(key)) problems.push(`${struct}: Swift has no field for "${key}"`);
  for (const f of fields) {
    if (!(f.name in value)) problems.push(`${struct}.${f.name}: missing from the payload`);
    else if (!fits(f.type, value[f.name])) problems.push(`${struct}.${f.name}: ${JSON.stringify(value[f.name])} is not ${f.type}`);
  }
  return problems;
}

const FIXTURES = join(__dirname, "../../fixtures");
const payloads = readdirSync(FIXTURES)
  .filter((f) => f.startsWith("raw-") && f.endsWith(".json"))
  .flatMap((f) => {
    const doc = workoutExport(toWorkout(JSON.parse(readFileSync(join(FIXTURES, f), "utf8"))), new Date());
    return [true, false].map((includeActiveEnergy) => ({ f, payload: mapWorkout(doc, { includeActiveEnergy }) }));
  });

describe("the payload matches the Swift records", () => {
  it("finds the structs it is checking", () => {
    expect([...structs.keys()].sort()).toEqual(
      ["DeviceRecord", "QuantitySampleRecord", "QuantitySeriesRecord", "WorkoutPayloadRecord"].sort(),
    );
  });

  it.each(payloads.map(({ f, payload }, i) => [`${f} #${i % 2}`, payload] as const))("%s", (_, payload) => {
    // Round-trip through JSON: the bridge carries values, not class instances.
    const wire = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(conforms("WorkoutPayloadRecord", wire)).toEqual([]);
  });

  it("would catch a renamed key", () => {
    const { payload } = payloads[0]!;
    const { start, ...rest } = payload;
    expect(conforms("WorkoutPayloadRecord", { ...rest, startMs: start })).toEqual([
      'WorkoutPayloadRecord: Swift has no field for "startMs"',
      "WorkoutPayloadRecord.start: missing from the payload",
    ]);
  });
});

describe("the JS declaration matches the Swift functions", () => {
  const swift = [...SWIFT.matchAll(/(Async)?Function\("(\w+)"\)/g)].map(([, a, n]) => `${n}:${a ? "async" : "sync"}`);
  const declared = [...BRIDGE.matchAll(/^\s+(\w+)\([^)]*\): (Promise<)?/gm)].map(([, n, p]) => `${n}:${p ? "async" : "sync"}`);

  it("names the same functions, sync and async alike", () => {
    expect(swift.length).toBeGreaterThan(0);
    expect(declared.sort()).toEqual(swift.sort());
  });

  it("registers the module under the name JS asks for", () => {
    const name = /requireNativeModule<\w+>\("(\w+)"\)/.exec(BRIDGE)?.[1];
    expect(SWIFT).toContain(`Name("${name}")`);
  });
});
