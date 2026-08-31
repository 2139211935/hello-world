# 把 Obsidian 的 00-知识库 同步到 Quartz 的 content/00-知识库
# 用法：右键“使用 PowerShell 运行”，或在该目录执行 `.\sync.ps1`
$ErrorActionPreference = "Stop"
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8

$src = "D:\obsidianNote\知识小屋\00-知识库"
$dst = "D:\obsidianNote\网站\content\00-知识库"

if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "源目录不存在: $src" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $dst -Force | Out-Null

foreach ($sub in "原子库", "概念库", "笔记库") {
    $s = Join-Path $src $sub
    $d = Join-Path $dst $sub
    if (Test-Path -LiteralPath $s) {
        if (Test-Path -LiteralPath $d) {
            Remove-Item -LiteralPath $d -Recurse -Force
        }
        Copy-Item -LiteralPath $s -Destination $d -Recurse -Force
    }
}

$md = (Get-ChildItem -LiteralPath $dst -Recurse -File -Filter *.md).Count
Write-Host "同步完成：content/00-知识库 目前 $md 篇 md。之后运行 npm run build 再推送即可。"