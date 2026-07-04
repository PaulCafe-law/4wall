$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonBin = if ($env:PYTHON_BIN) { $env:PYTHON_BIN } else { "python" }

Set-Location $RootDir
& $PythonBin -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (-not (Test-Path config.yaml)) {
  Copy-Item config.example.yaml config.yaml
  Write-Host "Created config.yaml from config.example.yaml. Set PERSON_PRESENCE_API_BASE_URL and PERSON_PRESENCE_DEVICE_TOKEN before publishing."
}
