import {
  camelizeWorkout,
  SAMPLE_INTERVAL_SECONDS,
  type ExportSample,
  type MachineType,
  type WorkoutExport,
} from "matrix-workouts-core";
import {
  HK_ACTIVITY_CYCLING,
  HK_LOCATION_INDOOR,
  HK_TYPE,
  type HealthWorkoutPayload,
  type QuantitySample,
  type QuantitySeries,
} from "./payload";

/**
 * WorkoutExport -> a HealthKit payload with nothing left to decide.
 *
 * The rules this implements, and the failure each one prevents, are in AGENTS.md
 * under "Rules the write has to follow". Read those before changing anything here;
 * several of them look like simplifications waiting to happen and are not.
 */

export interface MapOptions {
  /**
   * Write `activeEnergyBurned`. Off when the Apple Watch also recorded this ride,
   * because both land on the Move ring. The rider decides, per ride.
   */
  includeActiveEnergy: boolean;
}

/**
 * The HealthKit activity type for a machine. Always cycling: the app only offers
 * indoor bikes, and a record with no `machineType` at all (core reports that as
 * `"unknown"`) is still a bike ride as far as this corpus has ever shown. It must not
 * throw — an unexpected type is a ride to export, not a crash on the confirm screen.
 */
export function activityTypeFor(_machineType: MachineType): number {
  return HK_ACTIVITY_CYCLING;
}

/** One sample's window on the ride clock, in seconds from the start. */
interface Window {
  sample: ExportSample;
  startSeconds: number;
  durationSeconds: number;
}

/**
 * Each sample's own duration. Core's `elapsedSeconds` accumulates the upstream
 * `duration`, so for every sample but the last the gap to the next one IS its
 * duration. The last is the partial — anything from 0 to 11 s — and survives only
 * in the upstream record, so it is read from there, never assumed to be 0 or 10.
 */
function windows(doc: WorkoutExport): Window[] {
  const samples = doc.workout.samples;
  const intervals = camelizeWorkout(doc.source.record).intervals ?? [];
  const lastRaw = intervals.length === samples.length ? intervals.at(-1)?.duration : undefined;
  const lastDuration =
    typeof lastRaw === "number" && Number.isFinite(lastRaw) && lastRaw >= 0
      ? lastRaw
      : SAMPLE_INTERVAL_SECONDS;

  return samples.map((sample, i) => {
    const next = samples[i + 1];
    return {
      sample,
      startSeconds: sample.elapsedSeconds,
      durationSeconds: next ? next.elapsedSeconds - sample.elapsedSeconds : lastDuration,
    };
  });
}

function range(startMs: number, w: Window): Pick<QuantitySample, "start" | "end"> {
  const start = startMs + w.startSeconds * 1000;
  return { start, end: start + w.durationSeconds * 1000 };
}

/**
 * A discrete channel. A zero is a dropout, not a reading: core's samples are dense,
 * so an absent value arrives as 0. Dropping every zero also gives whole-series
 * suppression for free — a channel that is zero throughout yields no samples, and
 * the caller omits it. A zero-duration final sample stays, as an instant reading.
 */
function discrete(
  startMs: number,
  ws: readonly Window[],
  read: (s: ExportSample) => number,
  keep: (s: ExportSample) => boolean = (s) => read(s) !== 0,
): QuantitySample[] {
  return ws.filter((w) => keep(w.sample)).map((w) => ({ ...range(startMs, w), value: read(w.sample) }));
}

/**
 * Distance, from deltas of the console's running total — never from summing the
 * per-sample `distanceMeters`, which is quantized to 0.01 mile and sums short on
 * every fixture. HKWorkoutBuilder derives the workout's total from these samples,
 * so the sum of this series IS the distance Health will show.
 *
 * A zero-width window cannot hold a cumulative quantity, so a zero-duration final
 * sample gets no sample of its own — but its delta is NOT dropped. On every fixture
 * that ends that way, the final record still advances the running total, by 16 to
 * 113 m: the console's closing figure. Dropping it would under-report the ride by
 * as much as the quantization error this function exists to avoid, so it is added
 * to the preceding window instead.
 *
 * The total still lands a little under the platform's reported figure on some
 * rides. That residual is carried, not scaled away.
 */
function distance(startMs: number, ws: readonly Window[]): QuantitySample[] {
  if (!ws.some((w) => w.sample.cumulativeDistanceMeters !== 0)) return [];
  const out: QuantitySample[] = [];
  let previous = 0;
  for (const w of ws) {
    const cumulative = w.sample.cumulativeDistanceMeters;
    const delta = Math.max(0, cumulative - previous);
    previous = Math.max(previous, cumulative);
    const prior = out.at(-1);
    if (w.durationSeconds > 0) out.push({ ...range(startMs, w), value: delta });
    else if (prior) prior.value += delta;
  }
  return out;
}

/**
 * Energy, split across the ride in proportion to `powerWatts × duration`.
 *
 * APPROXIMATION: core carries calories only as a workout total, and mechanical work
 * is not metabolic energy — the console's calorie figure already folds in an
 * efficiency model we cannot see. The split keeps the total exactly what the
 * console reported and gives the Move ring a plausible shape instead of a flat
 * block; it does not claim to know when the calories were burned. With no power at
 * all it falls back to splitting by duration.
 */
function energy(startMs: number, ws: readonly Window[], calories: number | null): QuantitySample[] {
  if (calories === null || !(calories > 0)) return [];
  const timed = ws.filter((w) => w.durationSeconds > 0);
  const byPower = timed.map((w) => w.sample.powerWatts * w.durationSeconds);
  const powerTotal = byPower.reduce((a, b) => a + b, 0);
  const weights = powerTotal > 0 ? byPower : timed.map((w) => w.durationSeconds);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return timed.map((w, i) => ({ ...range(startMs, w), value: (calories * weights[i]!) / total }));
}

export function mapWorkout(doc: WorkoutExport, options: MapOptions): HealthWorkoutPayload {
  const w = doc.workout;
  const startMs = Date.parse(w.startedAt);
  const ws = windows(doc);

  const last = ws.at(-1);
  const seriesSeconds = last ? last.startSeconds + last.durationSeconds : 0;
  // The console's own duration and the sample clock can disagree by a few seconds.
  // The workout window has to hold every sample, and should not end before the
  // console said the ride did, so it takes the longer of the two.
  const durationSeconds = Math.max(seriesSeconds, w.durationSeconds);

  const series: QuantitySeries[] = [
    { type: HK_TYPE.distanceCycling, unit: "m", samples: distance(startMs, ws) },
    { type: HK_TYPE.cyclingPower, unit: "W", samples: discrete(startMs, ws, (s) => s.powerWatts) },
    { type: HK_TYPE.cyclingCadence, unit: "count/min", samples: discrete(startMs, ws, (s) => s.cadenceRpm) },
    { type: HK_TYPE.cyclingSpeed, unit: "m/s", samples: discrete(startMs, ws, (s) => s.speedKmh / 3.6) },
    {
      type: HK_TYPE.heartRate,
      unit: "count/min",
      // Core's dropout filter, not a second threshold. It already rejects zeros.
      samples: discrete(startMs, ws, (s) => s.heartRateBpm, (s) => s.heartRateValid),
    },
    {
      type: HK_TYPE.activeEnergyBurned,
      unit: "kcal",
      samples: options.includeActiveEnergy ? energy(startMs, ws, w.calories) : [],
    },
  ];
  // Deliberately absent: `totalSteps` (a crank counter, not steps — it would
  // corrupt the rider's step history), `inclinePercent` (always 0 on a bike),
  // `resistanceLevel` (no HealthKit type), and everything in `derived`.

  return {
    workoutId: w.id,
    activityType: activityTypeFor(w.machineType),
    locationType: HK_LOCATION_INDOOR,
    indoor: true,
    start: startMs,
    end: startMs + durationSeconds * 1000,
    device: {
      name: "Matrix console",
      manufacturer: "Matrix Fitness",
      model: w.machineType,
      localIdentifier: w.machineId,
    },
    series: series.filter((s) => s.samples.length > 0),
  };
}

/** Every quantity type the app may ever write — what authorization is requested for. */
export const SHARE_TYPES = Object.values(HK_TYPE);
