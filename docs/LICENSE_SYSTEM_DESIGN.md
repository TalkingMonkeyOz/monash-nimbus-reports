# PC-Locked License System Design

**Status**: Planned (deferred)
**Purpose**: Bind licenses to specific machines to prevent unauthorized distribution

---

## Workflow Summary

1. User runs app → sees Machine ID (hash of hardware identifiers)
2. User sends Machine ID to admin
3. Admin runs CLI: `license-generator --machine-id=XXX --app-token=YYY`
4. Admin sends `.license` file to user
5. User imports via app UI → app validates Machine ID match → unlocks

**PC Change**: User contacts admin with new Machine ID, gets new license file.

---

## License File Contents

```json
{
  "version": 1,
  "nimbus_url": "https://monash.nimbus.cloud/restapi",
  "app_token": "GUID",
  "username": "reports@monash.edu",
  "machine_id": "A1B2C3D4...",
  "issued_at": "2026-01-26T00:00:00Z",
  "expires_at": null
}
```

Encrypted with AES-256-GCM + HMAC signature.

---

## Machine ID Sources (Windows)

- `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`
- CPU ID via WMI
- Motherboard serial via WMI

Display format: `A1B2-C3D4-E5F6-G7H8` (base32 of first 8 bytes of SHA256)

---

## Implementation Components

| Component | Description |
|-----------|-------------|
| `src-tauri/src/license.rs` | Machine ID gen, license validation |
| `license-generator/` | Separate CLI binary for admins |
| `src/components/LicenseScreen.tsx` | No-license/invalid UI with Machine ID display |

---

## Security

| Threat | Mitigation |
|--------|------------|
| Copy to another PC | Machine ID mismatch |
| Tampering | HMAC signature |
| Key extraction | Obfuscation (acceptable risk for internal tool) |

---

**Version**: 1.0 | **Created**: 2026-01-26 | **Location**: docs/LICENSE_SYSTEM_DESIGN.md
