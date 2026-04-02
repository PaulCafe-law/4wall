param(
    [Parameter(Mandatory = $true)]
    [string]$DjiApiKey,

    [Parameter(Mandatory = $true)]
    [string]$PlannerBaseUrl,

    [switch]$Install,

    [string]$DeviceSerial
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apkPath = Join-Path $repoRoot "app\\build\\outputs\\apk\\prod\\debug\\app-prod-debug.apk"

Push-Location $repoRoot
try {
    & .\gradlew.bat :app:assembleProdDebug "-PDJI_API_KEY=$DjiApiKey" "-PPLANNER_BASE_URL=$PlannerBaseUrl"

    if ($Install) {
        $adbArgs = @()
        if ($DeviceSerial) {
            $adbArgs += @("-s", $DeviceSerial)
        }
        $adbArgs += @("install", "-r", $apkPath)
        & adb @adbArgs
    }
}
finally {
    Pop-Location
}
