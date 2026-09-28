# Handover: first run on a Mac

For a Claude Code session running locally on a Mac with Xcode, in a clone of
`bestimmaa/matrix-workouts-app`. Read `AGENTS.md` first. It owns the rules, and
this note doesn't repeat them.

## Where things stand (2026-09-28, `main` @ `8e475f6`)

- **Mapper** (`src/map/`): written and tested against all 12 raw fixtures.
- **Swift module** (`modules/health-write/ios/HealthWriteModule.swift`): compiles.
  PR #1's first run of `.github/workflows/ios.yml` finished `BUILD SUCCEEDED` for the
  Simulator on macos-26 with Xcode 26.6, with no errors or warnings. That is the only
  proof so far that it works.
- **Bridge**: `src/native/bridge.test.ts` checks the TS payload against the Swift
  `Record` structs by reading the source. It is a text check, not a runtime one.
- **Screens**: sign-in, the ride list, the confirm screen and the "exported" screen.
  An expired token now returns to sign-in, and opening a ride cold fetches the
  history (both fixed in PR #1).
- `npm test` (145 tests) and `npm run typecheck` are green.

**Nothing has run yet.** The app has never launched, and no workout has been written
to Health. That is what this session is for.

## The job

1. Get the app running in the Simulator.
2. Export one real ride.
3. Check in the Health app that it landed correctly.
4. Fix whatever breaks.

### 1. Build and launch

```
git checkout main && git pull
npm ci
npm run prebuild   # regenerates ios/, and on macOS it also installs pods
npm run ios        # dev build, installs to the Simulator, starts Metro
```

Expo Go won't work, because the app needs a dev build. `npx expo-doctor` should
report no issues; if it does, fix that first.

### 2. Export a ride

- Sign in with a real xId and passcode. The Simulator talks to the live
  `apollo.jfit.co` API, and there is no mock server. The rider types the passcode;
  never put it in a file, a log or a commit.
- Pick a ride. The charts should draw.
- Leave "Write active energy" on for the first export, then press
  **Write to Apple Health**.
- The first time, the HealthKit sheet should ask for **write access only** (workouts
  plus six types) and list no read access. Allow everything.
- The app should land on the "In Apple Health" screen, listing what it wrote.

### 3. Check it in Health (Simulator → Health app → Browse / Summary)

| Check | Expect |
|---|---|
| Workout type | Indoor Cycling, at the ride's start time and duration |
| Distance | Close to the console's figure, **a little under it**. That shortfall is expected (see AGENTS.md); don't scale the series to close it. If the total is well under, suspect summed `distanceMeters`. |
| Power, cadence, speed | Series present across the ride, at 10 s resolution |
| Heart rate | Present, with gaps where the strap dropped out. It should have no zeros. |
| Active energy | Total equals the ride's `calories`, shaped by power rather than flat |
| Source / device | "Matrix console", Matrix Fitness, with the machine type as the model |
| Steps | **Nothing new.** A step count would be a serious bug. |

Then:

- **Export the same ride again with energy off.** You get a second workout (there's
  no dedupe, by design) with no active energy.
- **Turn one type off** under Settings › Health › Data Access & Devices, then export
  again. The done screen should name the skipped type, and the write should still
  succeed.

### 4. Likely failure points, since none of this has run before

- **Record decoding**: `DeviceRecord.localIdentifier` is `String?`, and JS sends
  `null` when the ride has no machine id. Check that Expo accepts it.
- **Unit strings** passed to `HKUnit(from:)`: `"m"`, `"W"`, `"count/min"`, `"m/s"`,
  `"kcal"`. An invalid one raises an Objective-C exception. Swift can't catch that,
  so the app crashes rather than throwing.
- **Instant samples**: discrete readings where `start == end`, especially the final
  0 s sample. HealthKit should accept them. Confirm it does.
- **`finishWorkout()` returning nil**: this surfaces as "HealthKit finished the
  workout but returned nothing."
- The Simulator's Health app sometimes needs a relaunch before new data shows up.

If something needs deciding, decide it in `src/map/`. Swift stays dumb. If you change
a field on either side of the bridge, `bridge.test.ts` should fail until the other
side matches.

## When it works

- Update the **Status** section of `AGENTS.md`: the Swift is compiled, and a write
  has been verified in the Simulator (give the date and what you checked). Remove the
  "has not been compiled" wording.
- Add any gotcha you actually hit to `AGENTS.md`, with the failure it prevents.
- `npm test` and `npm run typecheck` must pass before committing. Work on a branch
  and open a PR; the iOS workflow runs when `modules/**`, `app.json` or package
  files change.
- Delete this file.

## Out of scope for this session

Android / Health Connect, dedupe, reading from Health, a device or TestFlight build,
and non-bike machines. See "Scope" and "Boundaries" in `AGENTS.md`.
