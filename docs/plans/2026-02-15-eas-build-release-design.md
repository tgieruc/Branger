# EAS Build + Release Workflow Design

**Date:** 2026-02-15
**Status:** Approved

## Goal

Set up EAS Build for Android and a GitHub Actions workflow that builds APKs on git tag push or manual dispatch.

## EAS Configuration

`eas.json` with two profiles:
- `preview`: builds `.apk` for direct sharing/testing (internal distribution)
- `production`: builds `.aab` for Play Store submission

## GitHub Actions Release Workflow

`.github/workflows/release.yml`:
- **Trigger 1:** Git tag push matching `v*` (e.g. `v1.0.0`)
  - Builds APK via EAS
  - Creates GitHub Release with APK attached
- **Trigger 2:** Manual workflow dispatch
  - Builds APK via EAS
  - Uploads as workflow artifact (downloadable from Actions tab)

## Secrets Required

- `EXPO_TOKEN`: EAS authentication token (from expo.dev → Account Settings → Access Tokens)

## Usage

- Release: `git tag v1.0.0 && git push --tags`
- Ad-hoc build: GitHub → Actions → "Build Android" → Run workflow

## OTA Updates

Configure `eas update` channel so JS-only changes can be pushed without rebuilding. Manual command, not automated.
