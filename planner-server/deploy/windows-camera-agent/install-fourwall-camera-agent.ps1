param(
    [string] $InstallDir = "C:\ProgramData\FourWall\camera-agent",
    [string] $EnvDir = "",
    [int[]] $Channels = @(1, 2, 3, 4, 5, 6),
    [string] $TaskPrefix = "FourWallDentalCameraAgent",
    [switch] $Doctor,
    [switch] $Once,
    [switch] $NoStart
)

$ErrorActionPreference = "Stop"

if (-not $EnvDir) {
    $EnvDir = Join-Path $PSScriptRoot "env"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "env") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "logs") | Out-Null

$agentSource = Join-Path $PSScriptRoot "camera_agent.py"
if (-not (Test-Path -LiteralPath $agentSource)) {
    $repoAgentSource = Join-Path $PSScriptRoot "..\..\scripts\camera_agent.py"
    if (Test-Path -LiteralPath $repoAgentSource) {
        $agentSource = (Resolve-Path -LiteralPath $repoAgentSource).Path
    }
}
if (-not (Test-Path -LiteralPath $agentSource)) {
    throw "camera_agent.py not found next to this installer or in planner-server\scripts"
}

$runnerSource = Join-Path $PSScriptRoot "run-fourwall-camera-agent.ps1"
if (-not (Test-Path -LiteralPath $runnerSource)) {
    throw "run-fourwall-camera-agent.ps1 not found next to this installer"
}

Copy-Item -LiteralPath $agentSource -Destination (Join-Path $InstallDir "camera_agent.py") -Force
Copy-Item -LiteralPath $runnerSource -Destination (Join-Path $InstallDir "run-fourwall-camera-agent.ps1") -Force

$powershellAgentSource = Join-Path $PSScriptRoot "fourwall-camera-agent.ps1"
if (Test-Path -LiteralPath $powershellAgentSource) {
    Copy-Item -LiteralPath $powershellAgentSource -Destination (Join-Path $InstallDir "fourwall-camera-agent.ps1") -Force
}

$runnerPath = Join-Path $InstallDir "run-fourwall-camera-agent.ps1"
$powershellAgentPath = Join-Path $InstallDir "fourwall-camera-agent.ps1"

foreach ($channel in $Channels) {
    $sourceEnv = Join-Path $EnvDir "dental-channel$channel.env"
    if (-not (Test-Path -LiteralPath $sourceEnv)) {
        throw "Missing env file for channel $channel`: $sourceEnv"
    }
    $targetEnv = Join-Path $InstallDir "env\dental-channel$channel.env"
    Copy-Item -LiteralPath $sourceEnv -Destination $targetEnv -Force

    if ($Doctor) {
        if (Test-Path -LiteralPath $powershellAgentPath) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $powershellAgentPath -EnvFile $targetEnv -Doctor
        } else {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runnerPath -EnvFile $targetEnv -Doctor -Json
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Doctor failed for channel $channel"
        }
        continue
    }

    if ($Once) {
        if (Test-Path -LiteralPath $powershellAgentPath) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $powershellAgentPath -EnvFile $targetEnv -Once
        } else {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runnerPath -EnvFile $targetEnv -Once
        }
        if ($LASTEXITCODE -ne 0) {
            throw "One-shot upload failed for channel $channel"
        }
        continue
    }

    $taskName = "$TaskPrefix-Ch$channel"
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    if (Test-Path -LiteralPath $powershellAgentPath) {
        $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$powershellAgentPath`" -EnvFile `"$targetEnv`""
    } else {
        $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`" -EnvFile `"$targetEnv`""
    }
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description "Fourth Wall dental clinic AVTECH camera agent channel $channel" | Out-Null

    if (-not $NoStart) {
        Start-ScheduledTask -TaskName $taskName
    }

    Write-Host "Installed $taskName"
}
