@echo off
REM ─────────────────────────────────────────────────────────────
REM  MCP-Builder: de dois cliques neste arquivo para comecar.
REM ─────────────────────────────────────────────────────────────
chcp 65001 >nul
title MCP-Builder
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado neste computador.
  echo.
  echo  1. Acesse https://nodejs.org e baixe a versao "LTS"
  echo  2. Instale com as opcoes padrao
  echo  3. De dois cliques neste arquivo de novo
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Preparando a ferramenta pela primeira vez, aguarde...
  call npm install --no-fund --no-audit --loglevel=error
  if errorlevel 1 goto erro
)

call npm run build --silent
if errorlevel 1 goto erro

node dist\cli.js
echo.
pause
exit /b 0

:erro
echo.
echo  Algo deu errado ao preparar a ferramenta. Veja a mensagem acima
echo  e consulte docs\06-perguntas-frequentes.md
pause
exit /b 1
