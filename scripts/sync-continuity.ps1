# Checkpoint publisher. Run from a trusted checkout after reviewing its manifest.
# It never switches, stages, cleans or resets the source working tree.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^(absent|[0-9a-f]{40})$')]
  [string]$ExpectedRemoteSha,
  [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot),
  [ValidateLength(1,160)]
  [string]$Message = 'checkpoint: preserva continuidade do INEPAD Reembolso',
  [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repository = 'https://github.com/eduardofalsarellajunior/comprova-reembolsos.git'
$continuityRef = 'refs/heads/codex/continuity'
$branch = 'codex/continuity'
$stageRoot = $null

function Invoke-CheckedGit {
  param([string]$At, [string[]]$Arguments)
  $result = @(& git -C $At @Arguments)
  if ($LASTEXITCODE -ne 0) { throw ('Git falhou: ' + ($Arguments | Select-Object -First 2) -join ' ') }
  return $result
}

function Read-RemoteRef {
  param([string]$At, [string]$Reference)
  $rows = @(Invoke-CheckedGit -At $At -Arguments @('ls-remote','origin',$Reference))
  if ($rows.Count -eq 0) { return 'absent' }
  if ($rows.Count -ne 1 -or $rows[0] -notmatch '^([0-9a-f]{40})\s+(.+)$' -or $Matches[2] -ne $Reference) {
    throw 'A referencia remota nao corresponde ao alvo esperado.'
  }
  return $Matches[1]
}

function Get-SafeFilePath {
  param([string]$Root, [string]$Relative)
  # Brackets in Next.js dynamic route names are literal paths, not globbing.
  if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '\\|(^|/)\.\.?(/|$)|[\r\n:*?<>|]') {
    throw "Caminho invalido: $Relative"
  }
  if ($Relative -match '(?i)(^|/)(\.git|node_modules|\.next|\.vercel|\.temp|comprovantes[^/]*)(/|$)|(^|/)\.env|(\.(xls|xlsx|csv|zip|pdf|pem|key|pfx|p12))$') {
    throw "Arquivo privado ou indevido: $Relative"
  }
  if ($Relative -notmatch '(?i)\.(md|tsx?|css|json|mjs|cjs|ps1|py|sql|svg|png)$') { throw "Extensao nao revisada: $Relative" }
  if ($Relative.EndsWith('.png') -and !$Relative.StartsWith('public/inepad-reembolso/')) {
    throw 'Apenas imagens de marca explicitamente revisadas podem ser publicadas.'
  }
  $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
  $full = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
  if (!$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Arquivo escapou da raiz esperada.' }
  return $full
}

try {
  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path
  $gitRoot = [IO.Path]::GetFullPath(@(Invoke-CheckedGit -At $source -Arguments @('rev-parse','--show-toplevel'))[0]).TrimEnd('\','/')
  if ($gitRoot -ne [IO.Path]::GetFullPath($source).TrimEnd('\','/')) { throw 'SourceRoot nao e a raiz Git.' }
  $origin = @(Invoke-CheckedGit -At $source -Arguments @('remote','get-url','origin'))[0]
  if ($origin -ne $repository) { throw 'Remoto nao e o repositorio INEPAD Reembolso.' }
  $manifestPath = Join-Path $source 'scripts/continuity-files.json'
  $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
  if ($manifest.repository -ne $repository -or $manifest.branch -ne $branch) { throw 'Manifesto mudou o destino autorizado.' }
  $files = @($manifest.files)
  if (!$files.Count -or @($files | Sort-Object -Unique).Count -ne $files.Count) { throw 'Lista vazia ou com duplicatas.' }
  if (@($manifest.deletedFiles).Count -gt 0) { throw 'Exclusoes exigem revisao manual; publicacao automatica abortada.' }
  foreach ($mandatory in @('AGENTS.md','PROJECT_STATUS.md','PROJECT_LOG.md','PROJECT_CHECKPOINT.md','vercel.json')) {
    if ($files -notcontains $mandatory) { throw "Arquivo obrigatorio ausente: $mandatory" }
  }
  $initial = Read-RemoteRef -At $source -Reference $continuityRef
  if ($initial -ne $ExpectedRemoteSha) { throw 'Outra conta avancou ou a branch mudou. Preserve o estado; nao publicar.' }
  $mainBefore = Read-RemoteRef -At $source -Reference 'refs/heads/main'
  if ($mainBefore -eq 'absent') { throw 'Main remota indisponivel.' }
  $baseRef = if ($initial -eq 'absent') { 'main' } else { $branch }

  $stageRoot = Join-Path ([IO.Path]::GetTempPath()) ('inepad-continuity-' + [guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($stageRoot)
  & git clone --depth=1 --single-branch --branch $baseRef -- $repository $stageRoot
  if ($LASTEXITCODE -ne 0) { throw 'Clone isolado falhou.' }
  $cloneBase = @(Invoke-CheckedGit -At $stageRoot -Arguments @('rev-parse','HEAD'))[0]
  $expectedBase = if ($initial -eq 'absent') { $mainBefore } else { $initial }
  if ($cloneBase -ne $expectedBase) { throw 'A branch mudou durante o clone.' }
  if ($initial -eq 'absent') { [void](Invoke-CheckedGit -At $stageRoot -Arguments @('switch','--create',$branch)) }

  $hashes = @{}
  foreach ($relative in $files) {
    $sourceFile = Get-SafeFilePath -Root $source -Relative $relative
    $targetFile = Get-SafeFilePath -Root $stageRoot -Relative $relative
    if (!(Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Arquivo do snapshot ausente: $relative" }
    if ((Get-Item -LiteralPath $sourceFile).Length -gt 2MB) { throw "Arquivo grande demais para checkpoint automatico: $relative" }
    if (!$relative.EndsWith('.png')) {
      $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $sourceFile
      if ($content -match '(?i)(?:eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|[?&]token=eyJ|gh[pousr]_[A-Za-z0-9]{30,})') {
        throw "Possivel segredo em $relative. Revise sem imprimir o conteudo."
      }
    }
    [void][IO.Directory]::CreateDirectory((Split-Path -Parent $targetFile))
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -ErrorAction Stop
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile).Hash
    if ($hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $targetFile).Hash) { throw 'Copia nao corresponde a origem.' }
    $hashes[$relative] = $hash
  }

  $config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $stageRoot 'vercel.json') | ConvertFrom-Json
  $rule = $config.git.deploymentEnabled.PSObject.Properties[$branch]
  if (!$rule -or $rule.Value -ne $false) { throw 'Branch sem bloqueio explicito de deploy automatico.' }
  if (Test-Path -LiteralPath (Join-Path $stageRoot '.github/workflows')) {
    throw 'Workflows precisam de revisao manual para impedir deploy adicional.'
  }
  if (Test-Path -LiteralPath (Join-Path $stageRoot 'vercel.ts')) { throw 'Configuracao Vercel adicional requer revisao.' }
  [void](Invoke-CheckedGit -At $stageRoot -Arguments (@('add','--') + $files))
  $staged = @(Invoke-CheckedGit -At $stageRoot -Arguments @('diff','--cached','--name-only'))
  foreach ($changed in $staged) { if ($files -notcontains $changed) { throw 'Arquivo staged fora do escopo.' } }
  [void](Invoke-CheckedGit -At $stageRoot -Arguments @('diff','--cached','--check'))
  Write-Output ('Arquivos revisados no snapshot: ' + $files.Count)
  Write-Output ('Arquivos alterados no commit: ' + $staged.Count)
  foreach ($relative in $files) {
    if ($hashes[$relative] -ne (Get-FileHash -Algorithm SHA256 -LiteralPath (Get-SafeFilePath -Root $source -Relative $relative)).Hash) {
      throw 'Arquivo de origem mudou durante a captura; repita o checkpoint apos estabilizar.'
    }
  }

  if ($staged.Count -gt 0) {
    $authorName = @(Invoke-CheckedGit -At $source -Arguments @('config','--get','user.name'))[0]
    $authorEmail = @(Invoke-CheckedGit -At $source -Arguments @('config','--get','user.email'))[0]
    if (!$authorName -or !$authorEmail) { throw 'Configure identidade Git local, sem inventar usuario.' }
    [void](Invoke-CheckedGit -At $stageRoot -Arguments @('-c',"user.name=$authorName",'-c',"user.email=$authorEmail",'commit','-m',$Message))
  }
  $candidate = @(Invoke-CheckedGit -At $stageRoot -Arguments @('rev-parse','HEAD'))[0]
  Write-Output "CHECKPOINT_LOCAL=$candidate"
  Write-Output "CHECKPOINT_PATH=$stageRoot"
  if (!$Publish) { Write-Output 'Sem -Publish: commit apenas local, nao transferido.'; return }

  $beforePush = Read-RemoteRef -At $source -Reference $continuityRef
  if ($beforePush -ne $ExpectedRemoteSha) { throw 'Concorrencia detectada antes do push; commit local preservado.' }
  [void](Invoke-CheckedGit -At $stageRoot -Arguments @('push','origin',"$($candidate):$continuityRef"))
  $confirmed = Read-RemoteRef -At $source -Reference $continuityRef
  if ($confirmed -ne $candidate) { throw 'Push nao confirmado pelo remoto; nao afirmar sincronizacao.' }
  Write-Output "CHECKPOINT_REMOTE=$confirmed"
  $mainAfter = Read-RemoteRef -At $source -Reference 'refs/heads/main'
  Write-Output "MAIN_BEFORE=$mainBefore"
  Write-Output "MAIN_AFTER=$mainAfter"
  if ($mainAfter -ne $mainBefore) { Write-Warning 'Main mudou durante o checkpoint por outra operacao; o script nao a publicou.' }
} catch {
  if ($stageRoot) { Write-Warning "Copia isolada preservada em $stageRoot" }
  throw
}
