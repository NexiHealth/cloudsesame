$ErrorActionPreference = 'Stop'

# __URL__ and __SHA256__ are filled in by the release workflow.
Install-ChocolateyZipPackage `
  -PackageName   $env:ChocolateyPackageName `
  -UnzipLocation (Split-Path -Parent $MyInvocation.MyCommand.Definition) `
  -Url64bit      '__URL__' `
  -Checksum64    '__SHA256__' `
  -ChecksumType64 'sha256'
