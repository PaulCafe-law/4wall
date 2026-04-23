param(
    [string]$DjiApiKey,

    [string]$DeviceSerial
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$plannerBaseUrl = "http://127.0.0.1:8000"
$apkPath = Join-Path $repoRoot "app\\build\\outputs\\apk\\prod\\debug\\app-prod-debug.apk"

function Get-GradleUserProperty {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $gradlePropertiesPath = Join-Path $HOME ".gradle\\gradle.properties"
    if (-not (Test-Path $gradlePropertiesPath)) {
        return $null
    }

    $pattern = "^\s*{0}\s*=\s*(.+?)\s*$" -f [regex]::Escape($Name)
    foreach ($line in Get-Content $gradlePropertiesPath) {
        if ($line -match $pattern) {
            return $matches[1]
        }
    }

    return $null
}

function Get-AndroidLocalProperty {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $localPropertiesPath = Join-Path $repoRoot "local.properties"
    if (-not (Test-Path $localPropertiesPath)) {
        return $null
    }

    $pattern = "^\s*{0}\s*=\s*(.+?)\s*$" -f [regex]::Escape($Name)
    foreach ($line in Get-Content $localPropertiesPath) {
        if ($line -match $pattern) {
            return $matches[1]
        }
    }

    return $null
}

function Resolve-DjiApiKey {
    if ($DjiApiKey -and $DjiApiKey.Trim()) {
        return $DjiApiKey.Trim()
    }

    if ($env:DJI_API_KEY -and $env:DJI_API_KEY.Trim()) {
        return $env:DJI_API_KEY.Trim()
    }

    $localProperty = Get-AndroidLocalProperty -Name "DJI_API_KEY"
    if ($localProperty -and $localProperty.Trim()) {
        return $localProperty.Trim()
    }

    $gradleProperty = Get-GradleUserProperty -Name "DJI_API_KEY"
    if ($gradleProperty -and $gradleProperty.Trim()) {
        return $gradleProperty.Trim()
    }

    throw "DJI_API_KEY not found. Pass -DjiApiKey, set DJI_API_KEY in the environment, add DJI_API_KEY to local.properties, or add DJI_API_KEY to $HOME\\.gradle\\gradle.properties."
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $adbArgs = @()
    if ($DeviceSerial) {
        $adbArgs += @("-s", $DeviceSerial)
    }
    $adbArgs += $Arguments
    & adb @adbArgs
}

Push-Location $repoRoot
try {
    $resolvedDjiApiKey = Resolve-DjiApiKey

    $devices = Invoke-Adb -Arguments @("devices")
    $deviceLinePattern = if ($DeviceSerial) {
        "^{0}\s+device\b" -f [regex]::Escape($DeviceSerial)
    } else {
        "^\S+\s+device\b"
    }
    $matchedDevices = @($devices) | Where-Object { $_ -match $deviceLinePattern }
    if ($matchedDevices.Count -eq 0) {
        throw "No authorized Android device found. Connect the phone by USB, enable USB debugging, and accept the RSA prompt first."
    }

    Invoke-Adb -Arguments @("reverse", "tcp:8000", "tcp:8000")

    & .\gradlew.bat :app:clean :app:assembleProdDebug "-PDJI_API_KEY=$resolvedDjiApiKey" "-PPLANNER_BASE_URL=$plannerBaseUrl"

    Invoke-Adb -Arguments @("install", "-r", $apkPath)

    Write-Output "USB local-server bring-up completed."
    Write-Output "Planner base URL: $plannerBaseUrl"
    Write-Output "Next: launch the app, login, download the mission bundle, then disconnect from the PC and switch the phone to the DJI controller for props-off bench only."
}
finally {
    Pop-Location
}
