# ===========================================================================
#  Servidor web local para probar la app (no necesita instalar nada).
#  Uso:  click derecho > "Ejecutar con PowerShell"   o en consola:
#        powershell -ExecutionPolicy Bypass -File .\serve.ps1
#  Luego abre en el navegador:  http://localhost:8080
# ===========================================================================
param([int]$Port = 8080)

$root = $PSScriptRoot
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".ico"  = "image/x-icon"
  ".map"  = "application/json"
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "No se pudo iniciar en $prefix" -ForegroundColor Red
  Write-Host "Prueba abriendo PowerShell como Administrador, o usa: firebase serve / VS Code Live Server." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host " GPS Live corriendo en  " -NoNewline -ForegroundColor Cyan
Write-Host $prefix -ForegroundColor Green
Write-Host " Abre esa direccion en Chrome/Edge. Ctrl+C para detener." -ForegroundColor DarkGray
Write-Host ""

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }
    $full = Join-Path $root ($path.TrimStart("/") -replace "/", "\")

    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - No encontrado: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
