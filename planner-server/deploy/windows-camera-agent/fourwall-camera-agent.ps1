param(
    [Parameter(Mandatory = $true)]
    [string] $EnvFile,
    [switch] $Doctor,
    [switch] $Once
)

$ErrorActionPreference = "Stop"

function Import-AgentEnv {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Env file not found: $Path"
    }
    $config = @{}
    Get-Content -LiteralPath $Path | ForEach-Object {
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
        $config[$name] = $value
    }
    return $config
}

function Get-RequiredConfig {
    param(
        [hashtable] $Config,
        [string] $Name
    )
    $value = [string] $Config[$Name]
    if (-not $value) {
        throw "missing_env:$Name"
    }
    return $value
}

function Get-IntConfig {
    param(
        [hashtable] $Config,
        [string] $Name,
        [int] $Default
    )
    $value = [string] $Config[$Name]
    if (-not $value) {
        return $Default
    }
    return [int] $value
}

function Get-AgentPaths {
    param([hashtable] $Config)
    $spoolDir = [string] $Config["CAMERA_AGENT_SPOOL_DIR"]
    if (-not $spoolDir) {
        $spoolDir = ".\camera-agent-spool"
    }
    $pendingDir = Join-Path $spoolDir "pending"
    New-Item -ItemType Directory -Force -Path $pendingDir | Out-Null
    return @{
        SpoolDir = $spoolDir
        PendingDir = $pendingDir
    }
}

function ConvertTo-AbsoluteApiUrl {
    param(
        [string] $ApiBaseUrl,
        [string] $PathOrUrl
    )
    if ($PathOrUrl -match "^https?://") {
        return $PathOrUrl
    }
    return $ApiBaseUrl.TrimEnd("/") + "/" + $PathOrUrl.TrimStart("/")
}

function Invoke-AgentJsonRequest {
    param(
        [hashtable] $Config,
        [string] $Method,
        [string] $Path,
        [object] $Payload = $null
    )
    $apiBaseUrl = Get-RequiredConfig $Config "CAMERA_AGENT_API_BASE_URL"
    $deviceToken = Get-RequiredConfig $Config "CAMERA_AGENT_DEVICE_TOKEN"
    $timeoutSeconds = Get-IntConfig $Config "CAMERA_AGENT_HTTP_TIMEOUT_SECONDS" 30
    $headers = @{
        Authorization = "Bearer $deviceToken"
        "Content-Type" = "application/json"
    }
    $body = $null
    if ($null -ne $Payload) {
        $body = $Payload | ConvertTo-Json -Depth 10 -Compress
    }
    return Invoke-RestMethod `
        -Method $Method `
        -Uri (ConvertTo-AbsoluteApiUrl $apiBaseUrl $Path) `
        -Headers $headers `
        -Body $body `
        -TimeoutSec $timeoutSeconds
}

function Read-AllBytesFromWeb {
    param(
        [string] $Url,
        [hashtable] $Headers,
        [int] $TimeoutSeconds
    )
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = "GET"
    $request.Timeout = $TimeoutSeconds * 1000
    foreach ($key in $Headers.Keys) {
        if ($key -ieq "User-Agent") {
            $request.UserAgent = [string] $Headers[$key]
        } elseif ($key -ieq "Accept") {
            $request.Accept = [string] $Headers[$key]
        } else {
            $request.Headers[$key] = [string] $Headers[$key]
        }
    }
    $response = $request.GetResponse()
    try {
        $stream = $response.GetResponseStream()
        $memory = New-Object System.IO.MemoryStream
        try {
            $stream.CopyTo($memory)
            return $memory.ToArray()
        } finally {
            $memory.Dispose()
            $stream.Dispose()
        }
    } finally {
        $response.Close()
    }
}

function Write-WebRequestBody {
    param(
        [string] $Url,
        [string] $Method,
        [hashtable] $Headers,
        [byte[]] $Body,
        [int] $TimeoutSeconds
    )
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = $Method
    $request.Timeout = $TimeoutSeconds * 1000
    foreach ($key in $Headers.Keys) {
        if ($key -ieq "Content-Type") {
            $request.ContentType = [string] $Headers[$key]
        } else {
            $request.Headers[$key] = [string] $Headers[$key]
        }
    }
    $request.ContentLength = $Body.Length
    $stream = $request.GetRequestStream()
    try {
        $stream.Write($Body, 0, $Body.Length)
    } finally {
        $stream.Dispose()
    }
    $response = $request.GetResponse()
    $response.Close()
}

function Capture-HttpSnapshot {
    param(
        [hashtable] $Config,
        [string] $ImagePath
    )
    $source = [string] $Config["CAMERA_AGENT_FRAME_SOURCE"]
    if (-not $source) {
        $source = "rtsp"
    }
    if ($source -ne "http_snapshot") {
        throw "unsupported_windows_frame_source:$source"
    }
    $url = Get-RequiredConfig $Config "CAMERA_AGENT_SNAPSHOT_URL"
    $timeoutSeconds = Get-IntConfig $Config "CAMERA_AGENT_HTTP_TIMEOUT_SECONDS" 30
    $headers = @{ Accept = "image/jpeg,*/*"; "User-Agent" = "fourwall-camera-agent-powershell/1.0" }
    $username = [string] $Config["CAMERA_AGENT_SNAPSHOT_USERNAME"]
    $password = [string] $Config["CAMERA_AGENT_SNAPSHOT_PASSWORD"]
    if ($username -or $password) {
        $raw = [Text.Encoding]::UTF8.GetBytes("${username}:${password}")
        $headers["Authorization"] = "Basic " + [Convert]::ToBase64String($raw)
    }
    $bytes = Read-AllBytesFromWeb $url $headers $timeoutSeconds
    if ($bytes.Length -lt 2 -or $bytes[0] -ne 0xff -or $bytes[1] -ne 0xd8) {
        throw "http_snapshot_not_jpeg"
    }
    [IO.File]::WriteAllBytes($ImagePath, $bytes)
}

function New-PendingFrame {
    param([hashtable] $Config)
    $paths = Get-AgentPaths $Config
    $capturedAt = [DateTimeOffset]::UtcNow
    $frameId = $capturedAt.ToString("yyyyMMddTHHmmssZ") + "-" + ([Guid]::NewGuid().ToString("N").Substring(0, 8))
    $imagePath = Join-Path $paths.PendingDir "$frameId.jpg"
    Capture-HttpSnapshot $Config $imagePath
    $hash = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sizeBytes = (Get-Item -LiteralPath $imagePath).Length
    $frame = [ordered]@{
        frameId = $frameId
        capturedAt = $capturedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ")
        contentType = "image/jpeg"
        checksumSha256 = $hash
        sizeBytes = $sizeBytes
        imagePath = $imagePath
    }
    $frame | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $paths.PendingDir "$frameId.json") -Encoding UTF8
    return $frame
}

function Read-PendingFrame {
    param([string] $MetadataPath)
    return Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
}

function Flush-PendingFrames {
    param([hashtable] $Config)
    $paths = Get-AgentPaths $Config
    $apiBaseUrl = Get-RequiredConfig $Config "CAMERA_AGENT_API_BASE_URL"
    $deviceToken = Get-RequiredConfig $Config "CAMERA_AGENT_DEVICE_TOKEN"
    $timeoutSeconds = Get-IntConfig $Config "CAMERA_AGENT_HTTP_TIMEOUT_SECONDS" 30
    $flushed = 0
    foreach ($metadata in (Get-ChildItem -LiteralPath $paths.PendingDir -Filter "*.json" | Sort-Object Name)) {
        $frame = Read-PendingFrame $metadata.FullName
        if (-not (Test-Path -LiteralPath $frame.imagePath)) {
            Remove-Item -LiteralPath $metadata.FullName -Force -ErrorAction SilentlyContinue
            continue
        }
        try {
            $intent = Invoke-AgentJsonRequest $Config "POST" "/v1/camera-ingest/upload-intents" @{
                frameId = $frame.frameId
                capturedAt = $frame.capturedAt
                contentType = $frame.contentType
                checksumSha256 = $frame.checksumSha256
                sizeBytes = [int64] $frame.sizeBytes
            }
            $uploadHeaders = @{}
            if ($intent.uploadHeaders) {
                foreach ($item in $intent.uploadHeaders.PSObject.Properties) {
                    $uploadHeaders[$item.Name] = [string] $item.Value
                }
            }
            if ($intent.uploadRequiresAuth) {
                $uploadHeaders["Authorization"] = "Bearer $deviceToken"
            }
            $uploadUrl = ConvertTo-AbsoluteApiUrl $apiBaseUrl ([string] $intent.uploadUrl)
            $body = [IO.File]::ReadAllBytes($frame.imagePath)
            Write-WebRequestBody $uploadUrl ([string] $intent.uploadMethod) $uploadHeaders $body $timeoutSeconds
            Invoke-AgentJsonRequest $Config "POST" "/v1/camera-ingest/frames/$($frame.frameId)/complete" @{
                checksumSha256 = $frame.checksumSha256
                sizeBytes = [int64] $frame.sizeBytes
            } | Out-Null
            Remove-Item -LiteralPath $frame.imagePath -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $metadata.FullName -Force -ErrorAction SilentlyContinue
            $flushed += 1
        } catch {
            Write-Error ("flush_failed frame={0} error={1}" -f $frame.frameId, $_.Exception.Message)
        }
    }
    return $flushed
}

function Send-Heartbeat {
    param(
        [hashtable] $Config,
        [int] $LocalSpoolCount,
        [string] $LastCapturedAt = $null,
        [string] $LastError = $null
    )
    Invoke-AgentJsonRequest $Config "POST" "/v1/camera-ingest/heartbeat" @{
        localSpoolCount = $LocalSpoolCount
        lastCapturedAt = $LastCapturedAt
        lastError = $LastError
    } | Out-Null
}

function Count-Pending {
    param([hashtable] $Config)
    $paths = Get-AgentPaths $Config
    return @((Get-ChildItem -LiteralPath $paths.PendingDir -Filter "*.json" -ErrorAction SilentlyContinue)).Count
}

function Invoke-CaptureAndFlushOnce {
    param([hashtable] $Config)
    Flush-PendingFrames $Config | Out-Null
    $frame = New-PendingFrame $Config
    Flush-PendingFrames $Config | Out-Null
    Send-Heartbeat $Config (Count-Pending $Config) $frame.capturedAt $null
    Write-Host ("captured frame={0}" -f $frame.frameId)
    return $frame
}

$config = Import-AgentEnv $EnvFile

if ($Doctor) {
    $checks = New-Object System.Collections.Generic.List[object]
    try {
        Get-RequiredConfig $config "CAMERA_AGENT_API_BASE_URL" | Out-Null
        Get-RequiredConfig $config "CAMERA_AGENT_DEVICE_TOKEN" | Out-Null
        Get-RequiredConfig $config "CAMERA_AGENT_SNAPSHOT_URL" | Out-Null
        Get-AgentPaths $config | Out-Null
        $checks.Add([pscustomobject]@{ name = "config"; status = "pass"; detail = "env loaded" })
    } catch {
        $checks.Add([pscustomobject]@{ name = "config"; status = "fail"; detail = $_.Exception.Message })
    }
    try {
        Invoke-AgentJsonRequest $config "GET" "/v1/camera-ingest/config" | Out-Null
        $checks.Add([pscustomobject]@{ name = "api.device_config"; status = "pass"; detail = "token accepted" })
    } catch {
        $checks.Add([pscustomobject]@{ name = "api.device_config"; status = "fail"; detail = $_.Exception.Message })
    }
    try {
        $paths = Get-AgentPaths $config
        $probe = Join-Path $paths.PendingDir ".doctor-http-snapshot.jpg"
        Capture-HttpSnapshot $config $probe
        $size = (Get-Item -LiteralPath $probe).Length
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
        $checks.Add([pscustomobject]@{ name = "http_snapshot.capture"; status = "pass"; detail = "captured $size bytes" })
    } catch {
        $checks.Add([pscustomobject]@{ name = "http_snapshot.capture"; status = "fail"; detail = $_.Exception.Message })
    }
    $ok = -not ($checks | Where-Object { $_.status -eq "fail" })
    [pscustomobject]@{ ok = $ok; checks = $checks } | ConvertTo-Json -Depth 10
    if ($ok) { exit 0 } else { exit 1 }
}

if ($Once) {
    try {
        Invoke-CaptureAndFlushOnce $config | Out-Null
        exit 0
    } catch {
        Write-Error ("camera_agent_error {0}" -f $_.Exception.Message)
        exit 1
    }
}

$intervalSeconds = Get-IntConfig $config "CAMERA_AGENT_INTERVAL_SECONDS" 10
while ($true) {
    try {
        Invoke-CaptureAndFlushOnce $config | Out-Null
    } catch {
        $message = $_.Exception.Message
        Write-Error ("camera_agent_error {0}" -f $message)
        try {
            Send-Heartbeat $config (Count-Pending $config) $null $message
        } catch {
            Write-Error ("heartbeat_failed {0}" -f $_.Exception.Message)
        }
    }
    Start-Sleep -Seconds $intervalSeconds
}
