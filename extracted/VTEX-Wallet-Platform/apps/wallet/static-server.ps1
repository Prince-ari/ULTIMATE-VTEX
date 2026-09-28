param(
    [int]$Port = 3002,
    [string]$Root = $PSScriptRoot
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Static server running on http://localhost:$Port/ (root: $Root)"

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".png"  = "image/png"
    ".webp" = "image/webp"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    $fs = $null
    try {
        $path = $request.Url.AbsolutePath
        if ($path -eq "/") { $path = "/index.html" }
        $filePath = Join-Path $Root ($path.TrimStart("/"))
        $filePath = [System.IO.Path]::GetFullPath($filePath)
        if (-not $filePath.StartsWith([System.IO.Path]::GetFullPath($Root))) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }
        if (Test-Path -LiteralPath $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = $mime[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }
            $response.ContentType = $contentType
            $response.Headers["Accept-Ranges"] = "bytes"
            $response.Headers["Cache-Control"] = "public, max-age=3600"

            $fs = [System.IO.File]::Open($filePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
            $totalLen = $fs.Length

            # HEAD : renvoyer juste les headers
            if ($request.HttpMethod -eq "HEAD") {
                $response.ContentLength64 = $totalLen
                $response.StatusCode = 200
                continue
            }

            $rangeHeader = $request.Headers["Range"]
            if ($rangeHeader -and $rangeHeader -match "^bytes=(\d*)-(\d*)$") {
                $startStr = $matches[1]
                $endStr = $matches[2]
                if ($startStr -ne "") { $start = [long]$startStr } else { $start = 0 }
                if ($endStr -ne "")   { $end = [long]$endStr }   else { $end = $totalLen - 1 }
                if ($start -lt 0) { $start = 0 }
                if ($end -ge $totalLen) { $end = $totalLen - 1 }
                if ($start -gt $end) {
                    $response.StatusCode = 416
                    $response.Headers["Content-Range"] = "bytes */$totalLen"
                    continue
                }
                $len = $end - $start + 1
                $response.StatusCode = 206
                $response.Headers["Content-Range"] = "bytes $start-$end/$totalLen"
                $response.ContentLength64 = $len
                $fs.Seek($start, [System.IO.SeekOrigin]::Begin) | Out-Null
                $buf = New-Object byte[] 65536
                $remaining = $len
                while ($remaining -gt 0) {
                    $chunk = [Math]::Min($buf.Length, $remaining)
                    $read = $fs.Read($buf, 0, $chunk)
                    if ($read -le 0) { break }
                    $response.OutputStream.Write($buf, 0, $read)
                    $remaining -= $read
                }
            } else {
                # Streaming complet (par chunks pour gros fichiers)
                $response.StatusCode = 200
                $response.ContentLength64 = $totalLen
                $buf = New-Object byte[] 65536
                while (($read = $fs.Read($buf, 0, $buf.Length)) -gt 0) {
                    $response.OutputStream.Write($buf, 0, $read)
                }
            }
        } else {
            $response.StatusCode = 404
            $buf = [System.Text.Encoding]::UTF8.GetBytes("Not found: $path")
            $response.OutputStream.Write($buf, 0, $buf.Length)
        }
    } catch {
        try {
            if ($_.Exception -is [System.Net.HttpListenerException]) {
                # Client closed connection — silent
            } else {
                $response.StatusCode = 500
                Write-Output "ERR $($request.Url.AbsolutePath) : $($_.Exception.Message)"
            }
        } catch {}
    } finally {
        if ($fs) { $fs.Dispose() }
        try { $response.Close() } catch {}
    }
}
