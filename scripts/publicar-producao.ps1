# Publica o backend do Investindo! no Supabase de produção, em 4 etapas:
#   1. segredos das funções  2. funções (coletor e excluir-conta)
#   3. agendamento (pg_cron)  4. primeira coleta, com histórico
#
# Uso, na pasta do projeto (depois de "npx supabase login" e "npx supabase link"):
#   powershell -ExecutionPolicy Bypass -File scripts/publicar-producao.ps1
#
# Os segredos vêm de supabase/functions/.env.producao (fora do git) e nunca
# são mostrados na tela. Pode rodar de novo: nada é duplicado.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Passo($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Checar($etapa) {
  if ($LASTEXITCODE -ne 0) { Write-Host "Falhou em: $etapa (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
}

$ref = (Get-Content 'supabase/.temp/project-ref' -ErrorAction SilentlyContinue)
if (-not $ref) { Write-Host 'Projeto não vinculado. Rode antes: npx supabase link --project-ref SEU_REF' -ForegroundColor Red; exit 1 }
$arquivoSegredos = 'supabase/functions/.env.producao'
if (-not (Test-Path $arquivoSegredos)) { Write-Host "Falta $arquivoSegredos" -ForegroundColor Red; exit 1 }
$segredo = ((Get-Content $arquivoSegredos) | Where-Object { $_ -like 'COLETOR_SEGREDO=*' }).Split('=', 2)[1]
$base = "https://$ref.supabase.co"
Write-Host "Projeto: $ref"

Passo '1/4 Segredos das funções'
npx supabase secrets set --env-file $arquivoSegredos --project-ref $ref; Checar 'segredos'

Passo '2/4 Publicando funções'
npx supabase functions deploy coletor --no-verify-jwt --project-ref $ref; Checar 'deploy do coletor'
npx supabase functions deploy excluir-conta --project-ref $ref; Checar 'deploy de excluir-conta'

Passo '3/4 Agendamento (pg_cron)'
$sql = (Get-Content 'supabase/agendamento.sql' -Raw).Replace('__PROJETO_URL__', $base).Replace('__COLETOR_SEGREDO__', $segredo)
$temp = [System.IO.Path]::GetTempFileName() + '.sql'
try {
  # UTF-8 sem BOM: o BOM quebraria a primeira linha do SQL.
  [System.IO.File]::WriteAllText($temp, $sql, (New-Object System.Text.UTF8Encoding $false))
  npx supabase db query --linked -f $temp | Out-Null; Checar 'agendamento'
} finally {
  Remove-Item $temp -ErrorAction SilentlyContinue
}
Write-Host 'Agendamentos criados.'

Passo '4/4 Primeira coleta (pode levar alguns minutos)'
$tarefas = @(
  @{ nome = 'indicadores'; extra = '&desde=2025-01-01' },
  @{ nome = 'tesouro'; extra = '' },
  @{ nome = 'cotacoes'; extra = '' },
  @{ nome = 'historico'; extra = '' },
  @{ nome = 'noticias'; extra = '' }
)
foreach ($t in $tarefas) {
  try {
    $r = Invoke-RestMethod -Method Post -Uri "$base/functions/v1/coletor?tarefa=$($t.nome)$($t.extra)" `
      -Headers @{ Authorization = "Bearer $segredo" } -TimeoutSec 300
    $falhas = @($r.detalhes | Where-Object { -not $_.ok })
    Write-Host ("{0,-12} {1} ({2} itens, {3} com falha)" -f $t.nome, $r.status, @($r.detalhes).Count, $falhas.Count)
    foreach ($f in $falhas) { Write-Host "   - $($f.item): $($f.mensagem)" -ForegroundColor Yellow }
  } catch {
    Write-Host ("{0,-12} ERRO: {1}" -f $t.nome, $_.Exception.Message) -ForegroundColor Red
  }
}

Write-Host "`nPronto. Abra https://investindo.vercel.app e recarregue a página." -ForegroundColor Green
