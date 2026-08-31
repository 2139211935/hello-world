@echo off
REM ============================================================
REM  一键发布：同步 Obsidian 00-知识库 -> 构建静态站 -> 推送 GitHub
REM  用法：双击本文件，或在 D:\obsidianNote\网站 目录下执行 publish.bat
REM ============================================================
setlocal
cd /d "%~dp0"

echo [1/4] Syncing notes from Obsidian...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1"
if errorlevel 1 goto :err

echo [2/4] Building site...
call npm run build
if errorlevel 1 goto :err

echo [3/4] Staging changes...
git add -A

echo [4/4] Committing and pushing...
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "update site"
)
git push
if errorlevel 1 goto :err

echo.
echo Done. Site updated -> https://2139211935.github.io/hello-world/
goto :eof

:err
echo.
echo ERROR: publish failed. See messages above.
exit /b 1
