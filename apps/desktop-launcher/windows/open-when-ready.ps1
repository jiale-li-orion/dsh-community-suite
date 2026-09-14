# Opens the harness Web UI in the default browser, but only once the port
# actually accepts a connection: polling here is what keeps the tab from landing
# on a dead page while the server is still starting.
#
# Used by start-meshfin.cmd as a background child, so it never owns the server's
# lifetime.
param(
  [int]$Port = 3080,
  [int]$TimeoutSeconds = 120
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $client.Connect('127.0.0.1', $Port)
    Start-Process "http://127.0.0.1:$Port/"
    exit 0
  } catch {
    Start-Sleep -Milliseconds 250
  } finally {
    if ($null -ne $client) { $client.Close() }
  }
}
Write-Error "[launcher] port $Port did not answer within $TimeoutSeconds seconds; open http://127.0.0.1:$Port/ yourself."
exit 1
