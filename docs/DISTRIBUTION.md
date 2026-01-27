# Distribution Guide

Private GitHub releases with cross-platform builds (Windows + macOS).

---

## Supported Platforms

| Platform | File | Notes |
|----------|------|-------|
| Windows (portable) | `_Windows_x64.exe` | Runs from anywhere, no install |
| Windows (installer) | `_x64-setup.exe` | NSIS installer |
| Windows (enterprise) | `_x64_en-US.msi` | MSI for GPO/SCCM |
| macOS Apple Silicon | `_macOS_AppleSilicon.dmg` | M1/M2/M3 Macs |
| macOS Intel | `_macOS_Intel.dmg` | Older Intel Macs |

---

## Automated Cross-Platform Builds

GitHub Actions automatically builds all platforms when you push a version tag.

### Trigger a Build

```bash
# 1. Update version in package.json, Cargo.toml, tauri.conf.json
# 2. Commit and push
git add .
git commit -m "chore: Bump version to X.Y.Z"
git push origin master

# 3. Tag and push (triggers build)
git tag vX.Y.Z
git push origin vX.Y.Z
```

### Build Output

After ~10 minutes, check **Actions** tab → **Releases** (draft).

Artifacts are also available under the workflow run.

### Platform-Specific Configuration

See `.github/workflows/build.yml` and `src-tauri/Cargo.toml` for:
- Conditional keyring dependencies (Windows Credential Manager vs macOS Keychain)
- Bundle targets for each OS

---

## Quick Setup

1. **Create private GitHub repo** `monash-nimbus-reports`
2. **Generate fine-grained token** (Contents: read-only, Metadata: read-only)
3. **Create `version.json`** in repo root
4. **Update `versionService.ts`** with token and manifest URL
5. **Create GitHub release** with exe attached

---

## version.json Format

```json
{
  "version": "0.1.0",
  "releaseDate": "2026-01-23",
  "downloadUrl": "https://github.com/ORG/REPO/releases/download/v0.1.0/monash-nimbus-reports.exe",
  "releaseNotes": "Initial release"
}
```

---

## Release Workflow

```bash
# 1. Update version in all files
#    - package.json
#    - src-tauri/Cargo.toml
#    - src-tauri/tauri.conf.json
#    - versionService.ts (APP_VERSION)
#    - version.json

# 2. Commit and tag
git add .
git commit -m "chore: Release vX.Y.Z"
git push origin master
git tag vX.Y.Z
git push origin vX.Y.Z

# 3. Wait for GitHub Actions (~10 min)
# 4. Review draft release, publish when ready
```

### Local Build (Windows only)

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## Download Tracking

GitHub provides download counts per release asset at:
`https://github.com/ORG/REPO/releases`

Query via API:
```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://api.github.com/repos/ORG/REPO/releases" \
  | jq '.[].assets[] | {name, download_count}'
```

---

## Security Notes

- Token embedded in binary (read-only, single-repo scope)
- Private repo prevents unauthorized access
- Rotate token annually

---

**Version**: 2.0
**Created**: 2026-01-23
**Updated**: 2026-01-27
