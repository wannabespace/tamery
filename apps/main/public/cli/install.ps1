# Installs or updates the Tamery CLI: irm https://tamery.app/cli/install.ps1 | iex
# $env:TAMERY_VERSION = '1.2.0' installs that version instead of the latest.

# iex runs this in the caller's session, so the block keeps its variables and preferences out of it.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  # Windows PowerShell 5.1 may still default to TLS 1.0, which GitHub and npm refuse.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $version = $env:TAMERY_VERSION
  if (-not $version) {
    try {
      $version = (Invoke-RestMethod -Uri 'https://registry.npmjs.org/-/package/tamery/dist-tags').latest
    } catch {
      throw "Tamery install failed: could not look up the latest version. Check your connection, or set `$env:TAMERY_VERSION. $_"
    }
  }

  $asset = 'tamery-windows-x64.exe'
  $url = "https://github.com/wannabespace/tamery/releases/download/cli-v$version"
  $dir = Join-Path $HOME '.tamery\bin'
  $exe = Join-Path $dir 'tamery.exe'
  $download = "$exe.download"
  $checksums = Join-Path $dir 'checksums.txt'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  Write-Host "Downloading Tamery CLI $version for windows-x64"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$url/$asset" -OutFile $download
    Invoke-WebRequest -UseBasicParsing -Uri "$url/checksums.txt" -OutFile $checksums
  } catch {
    Remove-Item $download, $checksums -Force -ErrorAction SilentlyContinue
    throw "Tamery install failed: could not download $url/$asset. Is $version a released version? $_"
  }

  $expected = Get-Content $checksums | ForEach-Object {
    $hash, $name = $_ -split '\s+', 2
    if ($name -and $name.TrimStart('*') -eq $asset) { $hash }
  } | Select-Object -First 1
  $actual = (Get-FileHash -Algorithm SHA256 -Path $download).Hash
  Remove-Item $checksums -Force
  if (-not $expected -or $expected -ne $actual) {
    Remove-Item $download -Force
    throw "Tamery install failed: the checksum of $asset does not match the release's checksums.txt. Nothing was installed."
  }

  # A running tamery.exe cannot be overwritten, only renamed.
  Remove-Item "$exe.old" -Force -ErrorAction SilentlyContinue
  if (Test-Path $exe) { Move-Item $exe "$exe.old" -Force }
  Move-Item $download $exe
  Write-Host "Installed Tamery CLI $version to $exe"

  # Read and written raw: [Environment]::SetEnvironmentVariable would save the user PATH as REG_SZ and break its %VAR% entries.
  $environment = Get-Item 'HKCU:\Environment'
  $userPath = $environment.GetValue('Path', '', 'DoNotExpandEnvironmentNames')
  if (($userPath -split ';') -notcontains $dir) {
    Set-ItemProperty -Path 'HKCU:\Environment' -Name 'Path' -Type ExpandString -Value ((@($userPath, $dir) | Where-Object { $_ }) -join ';')
    # Setting any user variable broadcasts the change, so new terminals see the new PATH.
    [Environment]::SetEnvironmentVariable('TAMERY_INSTALL', '1', 'User')
    [Environment]::SetEnvironmentVariable('TAMERY_INSTALL', $null, 'User')
    $env:Path = "$env:Path;$dir"
    Write-Host "Added $dir to your PATH."
  }

  Write-Host ''
  Write-Host 'Run: tamery bridge'
}
