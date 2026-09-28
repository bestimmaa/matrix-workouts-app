/**
 * What crosses the bridge: a workout with every decision already taken.
 *
 * The Swift side reads these fields and calls HealthKit with them. It does not pick
 * an activity type, convert a unit, choose a sample window or drop a reading — all
 * of that happened in `map/`, where the fixtures can check it. So everything here is
 * already in HealthKit's own vocabulary: raw enum values, quantity type identifiers
 * and unit strings `HKUnit(from:)` accepts.
 */

/** `HKWorkoutActivityType.cycling`. */
export const HK_ACTIVITY_CYCLING = 13;

/** `HKWorkoutSessionLocationType.indoor`. */
export const HK_LOCATION_INDOOR = 2;

/** The quantity types this app writes, as their `HKQuantityTypeIdentifier` raw values. */
export const HK_TYPE = {
  distanceCycling: "HKQuantityTypeIdentifierDistanceCycling",
  cyclingPower: "HKQuantityTypeIdentifierCyclingPower",
  cyclingCadence: "HKQuantityTypeIdentifierCyclingCadence",
  cyclingSpeed: "HKQuantityTypeIdentifierCyclingSpeed",
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  activeEnergyBurned: "HKQuantityTypeIdentifierActiveEnergyBurned",
} as const;

export type HealthQuantityType = (typeof HK_TYPE)[keyof typeof HK_TYPE];

/** One reading. Times are epoch milliseconds; `start === end` is an instant. */
export interface QuantitySample {
  start: number;
  end: number;
  value: number;
}

export interface QuantitySeries {
  type: HealthQuantityType;
  /** An `HKUnit(from:)` string. */
  unit: string;
  samples: QuantitySample[];
}

export interface HealthWorkoutPayload {
  /** The Matrix `workoutId`, stamped as `HKMetadataKeyExternalUUID`. */
  workoutId: string;
  activityType: number;
  locationType: number;
  /** Written as `HKMetadataKeyIndoorWorkout`. */
  indoor: boolean;
  /** Epoch milliseconds. */
  start: number;
  end: number;
  device: {
    name: string;
    manufacturer: string;
    model: string;
    localIdentifier: string | null;
  };
  /** Only the types that survived suppression — an absent type is not written at all. */
  series: QuantitySeries[];
}
