param(
    [string]$DjiApiKey,

    [Parameter(Mandatory = $true)]
    [string]$PlannerBaseUrl,

    [switch]$Install,

    [string]$DeviceSerial
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
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

Push-Location $repoRoot
try {
    $resolvedDjiApiKey = Resolve-DjiApiKey

    & .\gradlew.bat :app:clean :app:assembleProdDebug "-PDJI_API_KEY=$resolvedDjiApiKey" "-PPLANNER_BASE_URL=$PlannerBaseUrl"

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
