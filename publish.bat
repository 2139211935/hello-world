@echo off
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
if errorlevel 1 git commit -m "update site"
git push
if errorlevel 1 goto :err

echo.
echo Done. Site updated.
goto :eof

:err
echo.
echo ERROR: publish failed. See messages above.
exit /b 1
