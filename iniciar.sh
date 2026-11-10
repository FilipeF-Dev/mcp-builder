#!/usr/bin/env sh
# MCP-Builder: rode ./iniciar.sh para começar.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "O Node.js não está instalado. Instale a versão LTS em https://nodejs.org e rode de novo."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparando a ferramenta pela primeira vez, aguarde..."
  npm install --no-fund --no-audit --loglevel=error || exit 1
fi

npm run build --silent || exit 1
node dist/cli.js
