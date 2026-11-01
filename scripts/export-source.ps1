$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectDirectory 'package.json') | ConvertFrom-Json
$destinationDirectory = Join-Path $projectDirectory 'dist'
$archive = Join-Path $destinationDirectory ("Shiori-" + $package.version + "-source.zip")
if (Test-Path -LiteralPath $archive) { throw 'Source archive already exists. Preserve it and export a new version.' }
New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
# Explicit public files only. Never archive the working directory recursively.
$names = @('.github', '.gitignore', '.gitattributes', 'main.cjs', 'preload.cjs', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'LICENSE', 'README.md', 'THIRD-PARTY-NOTICES.md', 'src', 'public', 'tests', 'scripts', 'docs')
$items = @($names | ForEach-Object { Join-Path $projectDirectory $_ })
Compress-Archive -LiteralPath $items -DestinationPath $archive
Write-Output ("Source exported: " + $archive)
