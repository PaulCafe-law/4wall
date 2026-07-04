param(
    [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

& $Python -m venv .venv
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Write-Host "FOURWALL_HMI_OCR_READER_READY"
Write-Host "If this host should use the RTX 3090, verify the installed paddlepaddle package is the CUDA GPU build for this machine."
