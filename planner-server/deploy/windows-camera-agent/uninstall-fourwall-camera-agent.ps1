param(
    [int[]] $Channels = @(1, 2, 3, 4, 5, 6),
    [string] $TaskPrefix = "FourWallDentalCameraAgent"
)

$ErrorActionPreference = "Stop"

foreach ($channel in $Channels) {
    $taskName = "$TaskPrefix-Ch$channel"
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host "Not installed: $taskName"
        continue
    }
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed $taskName"
}
