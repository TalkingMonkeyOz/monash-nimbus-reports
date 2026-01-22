# Distribution Guide

Private GitHub releases with download tracking.

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
# 1. Update APP_VERSION in versionService.ts
# 2. Update version.json
# 3. Build
npm run tauri build

# 4. Tag and push
git commit -am "Release v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin master --tags

# 5. Create GitHub release, upload exe
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

**Version**: 1.0
**Created**: 2026-01-23
