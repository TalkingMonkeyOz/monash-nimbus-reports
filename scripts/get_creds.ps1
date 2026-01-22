# Get credentials from Windows Credential Manager
$targetLogin = "login:Test Monash.nimbus-mui"
$targetProfile = "profile:Test Monash.nimbus-mui"

# Use CredRead from advapi32.dll
Add-Type -Namespace "CredManager" -Name "Util" -MemberDefinition @"
[DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);

[DllImport("advapi32.dll", SetLastError = true)]
public static extern bool CredFree(IntPtr cred);

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CREDENTIAL {
    public int Flags;
    public int Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist;
    public int AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
}
"@

function Get-StoredCredential($target) {
    $credPtr = [IntPtr]::Zero
    $result = [CredManager.Util]::CredRead($target, 1, 0, [ref]$credPtr)

    if ($result) {
        $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [Type][CredManager.Util+CREDENTIAL])
        $password = ""
        if ($cred.CredentialBlobSize -gt 0) {
            $password = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, $cred.CredentialBlobSize / 2)
        }
        [CredManager.Util]::CredFree($credPtr)
        return @{
            Target = $cred.TargetName
            UserName = $cred.UserName
            Password = $password
        }
    }
    return $null
}

Write-Host "=== Login Credentials ==="
$loginCred = Get-StoredCredential $targetLogin
if ($loginCred) {
    Write-Host "Target: $($loginCred.Target)"
    Write-Host "Credential JSON: $($loginCred.Password)"
} else {
    Write-Host "Not found"
}

Write-Host ""
Write-Host "=== Profile Credentials ==="
$profileCred = Get-StoredCredential $targetProfile
if ($profileCred) {
    Write-Host "Target: $($profileCred.Target)"
    Write-Host "Credential JSON: $($profileCred.Password)"
} else {
    Write-Host "Not found"
}
