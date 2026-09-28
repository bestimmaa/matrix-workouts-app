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
- An iOS workflow that prebuilds and compiles the app for the Simulator on macOS,
  and checks the generated project is write-only.
- A contract test holding the TypeScript payload to the Swift `Record` structs, and
  the JS bridge declaration to the registered native functions.
- Tests for sign-in and the ride list: only the id and token reach the Keychain, only
  bikes are offered, an expired token signs the rider out.

### Fixed

- An expired sign-in now returns to the sign-in screen and says so, instead of showing
  core's message about reloading the site.
- Opening a ride with nothing loaded (a deep link, a cold start) fetches the history
  instead of showing "This ride is not loaded".
