# Perguntas frequentes

## Uso

**Preciso saber programar?**
Não. Você usa um menu numerado e responde perguntas. A parte técnica (rodar a análise nos servidores) é melhor fazer junto com alguém do TI, mas também é só escolher uma opção do menu.

**Quanto tempo leva?**
A entrevista leva cerca de 1 hora no total e pode ser dividida em várias sessões. A análise de cada computador leva menos de 1 minuto. As pendências dependem de quantas pessoas precisam ser consultadas.

**Parei no meio. Perdi tudo?**
Não. Cada resposta é salva na hora. Abra a ferramenta de novo e escolha **1. Continuar**.

**Respondi errado. Como corrijo?**
No menu, escolha **7. Corrigir respostas da entrevista** e o nível. A ferramenta mostra cada resposta atual: aperte Enter para manter ou digite a nova.

**Não sei responder uma pergunta.**
Digite `?`. Ela vira uma pendência com a sugestão de quem procurar. É muito melhor do que chutar.

**Por que a ferramenta não deixa analisar os computadores antes da entrevista?**
Porque, sem conhecer o negócio, o resultado da análise não pode ser interpretado. Veja [Como funciona](02-como-funciona.md). Se for realmente necessário (por exemplo, um técnico testando), existe `mcp-builder scan host --forcar`.

**Posso usar para mais de uma empresa?**
Sim. Ao abrir, a ferramenta pergunta qual empresa, ou se é uma nova. Cada uma tem a sua pasta.

## Problemas comuns

**"O Node.js não está instalado"**
Baixe a versão **LTS** em [nodejs.org](https://nodejs.org), instale com as opções padrão e abra a ferramenta de novo. Se continuar aparecendo, reinicie o computador.

**"O Windows protegeu o computador"**
Clique em **Mais informações → Executar assim mesmo**. Isso aparece para qualquer arquivo `.bat` baixado da internet.

**Erro ao instalar na primeira vez (`npm install`)**
Normalmente é falta de internet ou um proxy da empresa bloqueando o acesso. Peça ao TI para liberar `registry.npmjs.org`.

**A análise mostrou avisos ("! services: acesso negado")**
Algumas informações só podem ser lidas como administrador. No Windows, clique com o botão direito em `Iniciar MCP-Builder.bat` → **Executar como administrador**. A análise funciona mesmo sem isso, só fica menos completa.

**O antivírus bloqueou a ferramenta.**
A ferramenta usa comandos padrão do Windows (PowerShell) para ler a configuração, e alguns antivírus estranham isso. Peça ao TI para liberar a pasta do MCP-Builder. Por isso, também, é importante avisar o TI antes (veja [Segurança](05-seguranca-e-privacidade.md)).

**O relatório não abriu no navegador.**
Abra manualmente o arquivo `relatorio.html`, que fica na pasta `workspaces/<sua-empresa>/`.

**Um sistema que usamos não foi reconhecido.**
Ele provavelmente ainda não está no catálogo. A análise continua válida, e o sistema deve aparecer nas pendências como "programa desconhecido". Para incluí-lo no catálogo, veja [Para desenvolvedores](para-desenvolvedores.md#reconhecer-um-sistema-novo).

## Sobre o projeto

**O que é MCP?**
É um padrão aberto que permite a um assistente de IA se conectar com segurança aos sistemas de uma empresa. Veja o [Glossário](07-glossario.md).

**Os dados da minha empresa vão para algum lugar?**
Não. Hoje todas as etapas rodam no seu computador, inclusive a montagem das skills, que usa modelos prontos. Se no futuro houver uma opção de enriquecer as skills com uma IA externa, ela vai enviar só um resumo **sem senhas e sem dados pessoais**, e só com a sua confirmação. Veja [Segurança e privacidade](05-seguranca-e-privacidade.md).

**Funciona com o meu ERP?**
A ferramenta funciona com qualquer empresa: o que ela não reconhece, ela pergunta. O catálogo já reconhece vários ERPs e bancos de dados usados no Brasil, e cresce com contribuições.
