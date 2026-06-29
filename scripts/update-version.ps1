# After creating the release commit, run:
# powershell -ExecutionPolicy Bypass -File scripts/update-version.ps1

param(
  [string]$AppVersion = 'v0.1.0',
  [string]$VersionFile = 'src/config/version.js'
)

$ErrorActionPreference = 'Stop'

function Get-CyprusTimeZone {
  $timeZoneIds = @(
    'E. Europe Standard Time',
    'Asia/Nicosia'
  )

  foreach ($timeZoneId in $timeZoneIds) {
    try {
      return [System.TimeZoneInfo]::FindSystemTimeZoneById($timeZoneId)
    } catch {
      continue
    }
  }

  throw "Could not find a Cyprus time zone. Tried: $($timeZoneIds -join ', ')."
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
Push-Location $repoRoot
try {
  $cyprusTimeZone = Get-CyprusTimeZone
  $releaseTime = [System.TimeZoneInfo]::ConvertTime([System.DateTimeOffset]::UtcNow, $cyprusTimeZone)
  $releaseTimestamp = $releaseTime.ToString('ddMMyyyy_HHmm', [System.Globalization.CultureInfo]::InvariantCulture)

  $shortHash = (& git rev-parse --short=7 HEAD).Trim().ToLowerInvariant()
  if ($shortHash -notmatch '^[0-9a-f]{7}$') {
    throw "Expected a seven-character short Git hash, got '$shortHash'."
  }

  $target = Join-Path $repoRoot $VersionFile
  $content = @"
export const APP_VERSION = '$AppVersion';
export const BUILD_TIMESTAMP = '$releaseTimestamp';
export const COMMIT_HASH = '$shortHash';
export const APP_VERSION_LABEL =
  ```${APP_VERSION} \u00B7 `${BUILD_TIMESTAMP} \u00B7 `${COMMIT_HASH}``;
"@

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($target, $content, $encoding)
  Write-Output "Updated $VersionFile with $AppVersion \u00B7 $releaseTimestamp \u00B7 $shortHash"
} finally {
  Pop-Location
}
