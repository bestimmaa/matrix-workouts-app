# Changelog

All notable changes to this project will be documented in this file.

The version history source of truth is git tags in the format `vMAJOR.MINOR.PATCH`.

## [Unreleased]

### Added

- Expo SDK 57 app, iOS 17+, with expo-router: sign in with an xId, list the account's
  bike rides, view one ride's panels drawn from core's chart geometry, write it to
  Apple Health.
- `src/map/`: `WorkoutExport` → a HealthKit payload. Distance from the running total,
  each sample's own window, zero-as-missing, heart rate gated on core's dropout
  filter, energy split by power share. Tested against every fixture.
- `modules/health-write`: a local Expo module in Swift that writes the payload with
  `HKWorkoutBuilder`, requests share authorization only, and owns the HealthKit
  entitlement through a config plugin.
