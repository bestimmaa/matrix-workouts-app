import { NativeModule, requireNativeModule } from "expo";
import type { HealthWorkoutPayload } from "../map/payload";

/**
 * The JS side of the bridge, and nothing else. The payload arrives here finished —
 * see `src/map/` — and the Swift module writes it without deciding anything.
 */

export type ShareStatus = "authorized" | "denied" | "notDetermined";

declare class HealthWriteModule extends NativeModule<{}> {
  isAvailable(): boolean;
  /** Share-only. The read set is always empty. */
  requestAuthorization(types: readonly string[]): Promise<void>;
  /** Keyed by quantity type identifier, plus `workout` for the workout type. */
  authorizationStatus(types: readonly string[]): Record<string, ShareStatus>;
  /** Resolves to the saved HKWorkout's UUID. */
  writeWorkout(payload: HealthWorkoutPayload): Promise<string>;
}

export const HealthWrite = requireNativeModule<HealthWriteModule>("HealthWrite");
