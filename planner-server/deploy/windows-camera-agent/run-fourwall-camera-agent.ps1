param(
    [Parameter(Mandatory = $true)]
    [string] $EnvFile,
    [string] $InstallDir = "C:\ProgramData\FourWall\camera-agent",
    [string[]] $AgentArgs = @(),
    [switch] $Doctor,
    [switch] $Once,
    [switch] $Json
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Env file not found: $EnvFile"
}

Get-Content -LiteralPath $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
        return
    }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) {
        return
    }
    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    Set-Item -Path "Env:$name" -Value $value
}

$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$agentPath = Join-Path $InstallDir "camera_agent.py"
if (-not (Test-Path -LiteralPath $agentPath)) {
    throw "camera_agent.py not found in $InstallDir"
}

if ($Doctor) {
    $AgentArgs += "--doctor"
}
if ($Once) {
    $AgentArgs += "--once"
}
if ($Json) {
    $AgentArgs += "--json"
}

$channelName = [System.IO.Path]::GetFileNameWithoutExtension($EnvFile)
$stdoutPath = Join-Path $logDir "$channelName.out.log"
$stderrPath = Join-Path $logDir "$channelName.err.log"

$pythonExe = $null
$pythonArgs = @()
$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
if ($pyLauncher) {
    $pythonExe = $pyLauncher.Source
    $pythonArgs = @("-3")
} else {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        throw "Python 3 was not found. Install Python 3 or the Python launcher."
    }
    $pythonExe = $python.Source
}

& $pythonExe @pythonArgs $agentPath @AgentArgs >> $stdoutPath 2>> $stderrPath
exit $LASTEXITCODE
