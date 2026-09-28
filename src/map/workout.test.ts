import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toWorkout, workoutExport, type WorkoutExport } from "matrix-workouts-core";
import { HK_ACTIVITY_CYCLING, HK_LOCATION_INDOOR, HK_TYPE, type HealthWorkoutPayload } from "./payload";
import { mapWorkout, SHARE_TYPES } from "./workout";

const FIXTURES = join(__dirname, "../../fixtures");
const NOW = new Date("2026-09-28T00:00:00Z");

function load(file: string): WorkoutExport {
  const record = JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Record<string, unknown>;
  return workoutExport(toWorkout(record), NOW);
}

const files = readdirSync(FIXTURES).filter((f) => f.startsWith("raw-") && f.endsWith(".json"));
const byId = (prefix: string) => load(files.find((f) => f.startsWith(`raw-${prefix}`))!);

function series(payload: HealthWorkoutPayload, type: string) {
  return payload.series.find((s) => s.type === type);
}
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** A synthetic ride: `n` full samples and a final partial of `lastDuration` seconds. */
function synthetic(n: number, lastDuration: number, edit: (i: number) => Partial<Record<string, number>> = () => ({})) {
  const intervals = Array.from({ length: n }, (_, i) => ({
    duration: i === n - 1 ? lastDuration : 10,
    distance: 32.18,
    averageDistance: 32.18 * (i + 1),
    speed: 20,
    rpm: 80,
    power: 150,
    resistance: 5,
    heartRate: 140,
    incline: 0,
    totalSteps: 100 * i,
    ...edit(i),
  }));
  const record = {
    workoutId: "synthetic",
    workoutTime: "2026-09-01T10:00:00.000Z",
    duration: (n - 1) * 10 + lastDuration,
    distance: 32.18 * n,
    calories: 100,
    intervals,
  };
  return workoutExport(toWorkout(record), NOW);
}

describe("every fixture", () => {
  it("has fixtures to run against", () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  describe.each(files)("%s", (file) => {
    const doc = load(file);
    const payload = mapWorkout(doc, { includeActiveEnergy: true });
    const samples = doc.workout.samples;

    it("is an indoor cycling workout", () => {
      expect(payload.activityType).toBe(HK_ACTIVITY_CYCLING);
      expect(payload.locationType).toBe(HK_LOCATION_INDOOR);
      expect(payload.indoor).toBe(true);
      expect(payload.workoutId).toBe(doc.workout.id);
    });

    it("writes only the six mapped types — never steps, incline or resistance", () => {
      for (const s of payload.series) expect(SHARE_TYPES).toContain(s.type);
      expect(new Set(payload.series.map((s) => s.type)).size).toBe(payload.series.length);
    });

    it("keeps every sample inside the workout window", () => {
      for (const s of payload.series) {
        for (const q of s.samples) {
          expect(q.start).toBeGreaterThanOrEqual(payload.start);
          expect(q.end).toBeLessThanOrEqual(payload.end);
          expect(q.end).toBeGreaterThanOrEqual(q.start);
          expect(Number.isFinite(q.value)).toBe(true);
        }
      }
    });

    it("builds distance from the running total, not the quantized per-sample field", () => {
      const d = series(payload, HK_TYPE.distanceCycling)!;
      const total = sum(d.samples.map((q) => q.value));
      expect(total).toBeCloseTo(samples.at(-1)!.cumulativeDistanceMeters, 6);
      // Cumulative samples need a real interval.
      for (const q of d.samples) expect(q.end).toBeGreaterThan(q.start);
    });

    it("gates heart rate on core's validity flag", () => {
      const hr = series(payload, HK_TYPE.heartRate);
      const valid = samples.filter((s) => s.heartRateValid).length;
      expect(hr?.samples.length ?? 0).toBe(valid);
      for (const q of hr?.samples ?? []) expect(q.value).toBeGreaterThan(60);
    });

    it("drops zero readings from the discrete series", () => {
      for (const type of [HK_TYPE.cyclingPower, HK_TYPE.cyclingCadence, HK_TYPE.cyclingSpeed]) {
        for (const q of series(payload, type)?.samples ?? []) expect(q.value).not.toBe(0);
      }
    });

    it("converts speed to m/s", () => {
      const speed = series(payload, HK_TYPE.cyclingSpeed)!;
      const firstMoving = samples.find((s) => s.speedKmh !== 0)!;
      expect(speed.samples[0]!.value).toBeCloseTo(firstMoving.speedKmh / 3.6, 9);
    });

    it("splits the console's calories exactly, and only when asked to", () => {
      const e = series(payload, HK_TYPE.activeEnergyBurned);
      if (doc.workout.calories) {
        expect(sum(e!.samples.map((q) => q.value))).toBeCloseTo(doc.workout.calories, 6);
      }
      const off = mapWorkout(doc, { includeActiveEnergy: false });
      expect(series(off, HK_TYPE.activeEnergyBurned)).toBeUndefined();
    });
  });
});

describe("sample windows", () => {
  it("uses the final partial's own duration, not 10 and not 0", () => {
    // 6a5e4fe4 ends on a 1 s partial, 6a6368cb on an 8 s one. Distance is the series
    // to check: it has no gaps, where power may have dropped its last reading.
    for (const [id, last] of [["6a5e4fe4", 1], ["6a6368cb", 8]] as const) {
      const doc = byId(id);
      const d = series(mapWorkout(doc, { includeActiveEnergy: false }), HK_TYPE.distanceCycling)!;
      const q = d.samples.at(-1)!;
      expect((q.end - q.start) / 1000).toBe(last);
    }
  });

  it("folds a zero-duration final sample's distance into the window before it", () => {
    // Every fixture ending on a 0 s sample still advances the running total in it.
    const doc = byId("6ab15f0a");
    const samples = doc.workout.samples;
    const d = series(mapWorkout(doc, { includeActiveEnergy: false }), HK_TYPE.distanceCycling)!;
    expect(d.samples).toHaveLength(samples.length - 1);
    const closing = samples.at(-1)!.cumulativeDistanceMeters - samples.at(-2)!.cumulativeDistanceMeters;
    expect(closing).toBeGreaterThan(0);
    const beforeLast = samples.at(-2)!.cumulativeDistanceMeters - samples.at(-3)!.cumulativeDistanceMeters;
    expect(d.samples.at(-1)!.value).toBeCloseTo(beforeLast + closing, 6);
  });

  it("keeps a zero-duration final sample as an instant reading, out of the cumulative series", () => {
    const doc = synthetic(5, 0);
    const payload = mapWorkout(doc, { includeActiveEnergy: true });
    const power = series(payload, HK_TYPE.cyclingPower)!;
    expect(power.samples).toHaveLength(5);
    expect(power.samples.at(-1)!.start).toBe(power.samples.at(-1)!.end);
    expect(series(payload, HK_TYPE.distanceCycling)!.samples).toHaveLength(4);
    expect(series(payload, HK_TYPE.activeEnergyBurned)!.samples).toHaveLength(4);
  });

  it("never lays samples out as index * 10", () => {
    const doc = synthetic(4, 7);
    const payload = mapWorkout(doc, { includeActiveEnergy: false });
    expect((payload.end - payload.start) / 1000).toBe(37);
  });
});

describe("zero means missing", () => {
  it("does not write a channel that is zero for the whole ride", () => {
    // No fixture lacks heart rate entirely, so this one is built.
    const doc = synthetic(20, 10, () => ({ heartRate: 0 }));
    const payload = mapWorkout(doc, { includeActiveEnergy: true });
    expect(series(payload, HK_TYPE.heartRate)).toBeUndefined();
    expect(series(payload, HK_TYPE.cyclingPower)).toBeDefined();
  });

  it("drops a single dropout and keeps the rest of the series", () => {
    const doc = synthetic(20, 10, (i) => (i === 7 ? { power: 0 } : {}));
    const power = series(mapWorkout(doc, { includeActiveEnergy: false }), HK_TYPE.cyclingPower)!;
    expect(power.samples).toHaveLength(19);
  });
});

describe("energy split", () => {
  it("follows power, not the clock", () => {
    const doc = synthetic(10, 10, (i) => ({ power: i < 5 ? 100 : 300 }));
    const e = series(mapWorkout(doc, { includeActiveEnergy: true }), HK_TYPE.activeEnergyBurned)!;
    expect(e.samples[9]!.value).toBeCloseTo(e.samples[0]!.value * 3, 9);
    expect(sum(e.samples.map((q) => q.value))).toBeCloseTo(100, 9);
  });

  it("falls back to duration when there is no power at all", () => {
    const doc = synthetic(10, 10, () => ({ power: 0 }));
    const e = series(mapWorkout(doc, { includeActiveEnergy: true }), HK_TYPE.activeEnergyBurned)!;
    expect(e.samples.every((q) => Math.abs(q.value - 10) < 1e-9)).toBe(true);
  });
});

describe("activity type", () => {
  it("does not throw on a record with no machineType", () => {
    const doc = synthetic(3, 10);
    expect(doc.workout.machineType).toBe("unknown");
    expect(mapWorkout(doc, { includeActiveEnergy: false }).activityType).toBe(HK_ACTIVITY_CYCLING);
  });
});
