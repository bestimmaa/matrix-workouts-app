import ExpoModulesCore
import HealthKit

// The native half of the write, and deliberately the dumb half.
//
// Everything that is a decision — activity type, units, sample windows, which
// readings are dropouts, how energy is split — was taken in `src/map/`, where the
// fixtures can test it. This file turns the finished payload into HealthKit objects
// and calls `beginCollection` → `addSamples` → `endCollection` → `finishWorkout`.
// If something here starts choosing, it belongs in `map/` instead.

struct QuantitySampleRecord: Record {
  @Field var start: Double = 0
  @Field var end: Double = 0
  @Field var value: Double = 0
}

struct QuantitySeriesRecord: Record {
  @Field var type: String = ""
  @Field var unit: String = ""
  @Field var samples: [QuantitySampleRecord] = []
}

struct DeviceRecord: Record {
  @Field var name: String = ""
  @Field var manufacturer: String = ""
  @Field var model: String = ""
  @Field var localIdentifier: String? = nil
}

struct WorkoutPayloadRecord: Record {
  @Field var workoutId: String = ""
  @Field var activityType: Int = 0
  @Field var locationType: Int = 0
  @Field var indoor: Bool = false
  @Field var start: Double = 0
  @Field var end: Double = 0
  @Field var device: DeviceRecord = DeviceRecord()
  @Field var series: [QuantitySeriesRecord] = []
}

final class HealthUnavailableException: Exception {
  override var reason: String { "Health data is not available on this device." }
}

final class UnknownTypeException: GenericException<String> {
  override var reason: String { "Not a HealthKit quantity type or activity: \(param)" }
}

final class WorkoutNotSavedException: Exception {
  override var reason: String { "HealthKit finished the workout but returned nothing." }
}

private func date(_ ms: Double) -> Date {
  Date(timeIntervalSince1970: ms / 1000)
}

private func quantityType(_ identifier: String) throws -> HKQuantityType {
  guard let type = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier)) else {
    throw UnknownTypeException(identifier)
  }
  return type
}

/// The status string JS sees. Share authorization, unlike read, is answerable honestly.
private func describe(_ status: HKAuthorizationStatus) -> String {
  switch status {
  case .sharingAuthorized: return "authorized"
  case .sharingDenied: return "denied"
  case .notDetermined: return "notDetermined"
  @unknown default: return "notDetermined"
  }
}

public class HealthWriteModule: Module {
  private let store = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("HealthWrite")

    Function("isAvailable") { () -> Bool in
      HKHealthStore.isHealthDataAvailable()
    }

    // Write-only: the read set is empty, always. See AGENTS.md "Consequences of no dedupe".
    AsyncFunction("requestAuthorization") { (types: [String]) async throws in
      guard HKHealthStore.isHealthDataAvailable() else { throw HealthUnavailableException() }
      var share: Set<HKSampleType> = [HKObjectType.workoutType()]
      for identifier in types { share.insert(try quantityType(identifier)) }
      try await self.store.requestAuthorization(toShare: share, read: [])
    }

    /// Keyed by quantity type identifier, plus "workout" for the workout type itself.
    Function("authorizationStatus") { (types: [String]) throws -> [String: String] in
      var result = ["workout": describe(self.store.authorizationStatus(for: HKObjectType.workoutType()))]
      for identifier in types {
        result[identifier] = describe(self.store.authorizationStatus(for: try quantityType(identifier)))
      }
      return result
    }

    /// Returns the saved workout's HealthKit UUID.
    AsyncFunction("writeWorkout") { (payload: WorkoutPayloadRecord) async throws -> String in
      guard HKHealthStore.isHealthDataAvailable() else { throw HealthUnavailableException() }
      guard let activity = HKWorkoutActivityType(rawValue: UInt(payload.activityType)) else {
        throw UnknownTypeException(String(payload.activityType))
      }
      guard let location = HKWorkoutSessionLocationType(rawValue: payload.locationType) else {
        throw UnknownTypeException(String(payload.locationType))
      }

      let configuration = HKWorkoutConfiguration()
      configuration.activityType = activity
      configuration.locationType = location

      let device = HKDevice(
        name: payload.device.name,
        manufacturer: payload.device.manufacturer,
        model: payload.device.model,
        hardwareVersion: nil,
        firmwareVersion: nil,
        softwareVersion: nil,
        localIdentifier: payload.device.localIdentifier,
        udiDeviceIdentifier: nil
      )

      var samples: [HKSample] = []
      for series in payload.series {
        let type = try quantityType(series.type)
        let unit = HKUnit(from: series.unit)
        for s in series.samples {
          samples.append(HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: unit, doubleValue: s.value),
            start: date(s.start),
            end: date(s.end),
            device: device,
            metadata: nil
          ))
        }
      }

      let builder = HKWorkoutBuilder(healthStore: self.store, configuration: configuration, device: device)
      do {
        try await builder.beginCollection(at: date(payload.start))
        if !samples.isEmpty { try await builder.addSamples(samples) }
        try await builder.addMetadata([
          // Not dedupe — HealthKit does not enforce uniqueness on it. It is what makes
          // "which rides have I exported?" answerable later without a ledger.
          HKMetadataKeyExternalUUID: payload.workoutId,
          HKMetadataKeyIndoorWorkout: payload.indoor,
        ])
        try await builder.endCollection(at: date(payload.end))
        guard let workout = try await builder.finishWorkout() else { throw WorkoutNotSavedException() }
        return workout.uuid.uuidString
      } catch {
        builder.discardWorkout()
        throw error
      }
    }
  }
}
