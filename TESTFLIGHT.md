# TestFlight — Beep Captain

Mirrors the newTan setup (`/home/alinameer/Pictures/TAN/newTan/TESTFLIGHT.md`): same
Apple team, same ASC API key, same EAS account (`alinamer`).

> **Naming:** the App Store listing is **"Beep Captain"** ("Beeb" was taken; the rider app
> had to become "Beep Taxi"). The repo folder (`beeb-caption/`), the EAS slug
> (`beeb-captain`) and all in-app i18n copy still say "Beeb" — only the store identity,
> bundle ID and home-screen name are "Beep". Don't "fix" the slug; it would orphan the EAS
> project.

## Identity

| | |
| --- | --- |
| **Bundle ID** | `com.beep.captain` (portal id `7V2ZT322NJ`) |
| **ASC App ID** | `6791985509` — listing name "Beep Captain", SKU `beep-captain-001` |
| **EAS project** | `300be89d-59a9-47cf-811c-8134475fbc73` (`@alinamer/beeb-captain`) |
| **Apple ID** | tandeviq@gmail.com |
| **Team** | Haithem Mustafa (**Individual**) — `F2B493H3RF` |
| **ASC key** | `~/.apple-keys/AuthKey_Y5KYYJU34G.p8` (id `Y5KYYJU34G`, issuer `0a0a3a4e-cd08-4232-8a3e-fd774070806f`) |
| **Distribution cert** | `5MUKNQ3FXM` — serial `1D01D9E76B0CFE36D6FBE2B916FC7EC`, expires 2027-03-25. **Shared with TAN + Beep Taxi.** |
| **Provisioning profile** | `6F3RWXFVWM` (`*[expo] com.beep.captain AppStore`), expires 2027-03-25 |

ASC: https://appstoreconnect.apple.com/apps/6791985509/testflight/ios

## 🔑 ALWAYS prefix eas commands with the ASC key env vars

This is the single most important thing in this file. **`eas` run bare will prompt for an
Apple ID password and fail** — Apple's Developer Portal auth returns a 500, and the cached
session in `~/.app-store/auth/` is long expired:

```
✔ Do you want to log in to your Apple account? … yes
✖ Logging in... Authentication with Apple Developer Portal failed!
   Received an internal server error from Apple's ... servers, please try again later.
```

With the env vars below, EAS authenticates with the **API key** and never asks to log in
(it only asks for the Apple Team Type — answer **Individual**):

```bash
export EXPO_ASC_API_KEY_PATH=/home/alinameer/.apple-keys/AuthKey_Y5KYYJU34G.p8
export EXPO_ASC_KEY_ID=Y5KYYJU34G
export EXPO_ASC_ISSUER_ID=0a0a3a4e-cd08-4232-8a3e-fd774070806f
export EXPO_APPLE_TEAM_ID=F2B493H3RF
```

## ⚠️ Never revoke a distribution certificate

The team is at **Apple's hard cap of 3** `IOS_DISTRIBUTION` certs and **all three are shared
with TAN**. A 4th cannot be created. In `eas credentials`, always answer **yes** to
*"Reuse this distribution certificate?"* — never pick *"Add a new one"* or *"Delete one from
your account"*. Revoking one breaks TAN's ability to ship. Provisioning **profiles** are
per-app and safe to create.

## Build & submit

```bash
eas build --platform ios --profile production --auto-submit
```

(with the env vars above exported). If auto-submit fails, submit separately:

```bash
eas submit --platform ios --latest
```

Apple processing takes 5–15 min: Processing → Ready to Submit.

## ⚠️ The network is flaky — just retry

Roughly **1 in 5** `eas` invocations dies instantly with:

```
request to https://api.expo.dev/graphql failed, reason:
    Error: GraphQL request failed.
```

This is **not** a real error and nothing is left half-done — **re-run the identical command**.
Verified 2026-07-17: raw `curl` and Node `fetch` were both 12/12 clean against the same
endpoint, so it's the EAS CLI's bundled http client, and it comes in bursts. Forcing IPv4
(`NODE_OPTIONS=--dns-result-order=ipv4first`) does **not** help — don't bother. (Local IPv6
*is* genuinely broken here — `curl -6` fails — but that's a red herring.)

## Versioning

- **App version** (`app.json` → `version`): bump manually per release. Currently `1.0.0`.
- **Build number**: auto-increments (`autoIncrement: true` + `appVersionSource: "remote"`,
  counter lives on EAS). First build was **1**.

> ⚠️ **Build-number collision** (bit TAN on 1.5.1): if EAS's remote counter drifts behind ASC,
> Apple **silently rejects** the upload — the build succeeds, `eas submit` says FINISHED, and
> nothing ever appears in ASC. Verify by polling ASC for the build, not by trusting submit.

## iOS-specific notes for this app

- **Waze deep links** require `LSApplicationQueriesSchemes: ["waze", "comgooglemaps"]` in
  `app.json` (already set). Without it, `Linking.canOpenURL('waze://')` always returns false
  on iOS and navigation silently falls back to Google Maps — the feature looks "working" but
  never opens Waze. Don't remove it.
- **Location**: only `NSLocationWhenInUseUsageDescription` is declared. If captains ever need
  background tracking while driving, that needs `NSLocationAlwaysAndWhenInUseUsageDescription`
  + `UIBackgroundModes: ["location"]`, and Apple will demand justification at review.

## Release history

- **1.0.0 (build 2)** — first successful TestFlight build, 2026-07-17. `VALID` on ASC.
  EAS build id `489ca204-8fdd-404c-97c1-04e629fc66db`.
  Ships the Waze integration + live-trip map fixes (commit `3e06da6`).
  Build 1 ERRORED on the push-entitlement trap (see below).

## 🪤 The push-entitlement trap

Same trap the rider app hit — see `../Beeb/TESTFLIGHT.md` for the full write-up. In short:
`eas credentials` prints a green `✔ Synced capabilities: Enabled: Push Notifications` that is
**false** under ASC-API-key auth (`Skipping capability identifier syncing... not using
Cookies`), so the profile lacks `aps-environment` and the build fails. Fix = enable
`PUSH_NOTIFICATIONS` on bundle id `7V2ZT322NJ` via the ASC API, delete the stale profile from
the EAS project (not just Apple — EAS caches it), regenerate, and decode the new profile to
confirm `aps-environment` is present before rebuilding.

## Known gaps

- **`google-services.json` is missing AND gitignored** → Android FCM push unconfigured.
  Doesn't affect iOS/TestFlight, but Android release builds will break until it's restored.
- **iOS APNs push key not generated.** The `Push Notifications` *capability* was auto-enabled
  on the bundle ID during credentials setup, but there's still no push key, so
  `getDevicePushTokenAsync` fails on iOS — captains get **no trip-offer pushes on iOS**.
  The push provider swallows the error, so the app still runs. This matters more here than in
  the rider app. To fix: `eas credentials` → **Push Notifications: Manage your Apple Push
  Notifications Key**.
