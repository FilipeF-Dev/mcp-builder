# Comece aqui

Este guia é para quem **não é da área técnica**. Se você sabe usar o computador no dia a dia, consegue usar o MCP-Builder.

## O que você vai conseguir

No fim do processo, sua empresa terá tudo o que é preciso para ligar um **assistente de IA** que responde dúvidas dos colaboradores e ajuda com pequenos suportes, como "como faço uma requisição de compra?" ou "esqueci minha senha do sistema".

Para isso, o assistente precisa conhecer a empresa. O MCP-Builder **coleta e organiza esse conhecimento** por você.

## Antes de começar

| Você vai precisar de | Por quê |
|---|---|
| Um computador com Windows ou Linux | Para rodar a ferramenta |
| O **Node.js** instalado ([nodejs.org](https://nodejs.org), botão "LTS") | É o "motor" que a ferramenta usa. Instale com as opções padrão |
| Cerca de **1 hora** para a entrevista | Pode ser dividida em várias sessões: tudo fica salvo |
| Alguém do TI (interno ou terceirizado) por perto na etapa 2 | Para indicar as faixas de rede e rodar a análise nos servidores |
| **Autorização** do responsável pela empresa | A ferramenta só lê informações, mas é ela quem examina os computadores. Veja [Segurança e privacidade](05-seguranca-e-privacidade.md) |

## Passo a passo

### 1. Baixe o projeto

No GitHub, clique em **Code → Download ZIP** e extraia a pasta onde preferir (por exemplo, na Área de Trabalho).

### 2. Abra a ferramenta

- **Windows:** dê dois cliques em **`Iniciar MCP-Builder.bat`**
- **Linux:** no terminal, dentro da pasta, rode `./iniciar.sh`

Na primeira vez, ela leva cerca de um minuto se preparando. Nas próximas, abre na hora.

> Se o Windows mostrar o aviso "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. Isso acontece com qualquer arquivo baixado da internet.

### 3. Siga o menu

A ferramenta pergunta o nome da empresa e mostra um menu como este:

```
━━ Restaurante Exemplo ━━
  … Etapa 1: Conhecer o negócio      (2 de 6 níveis concluídos)
  ○ Etapa 2: Mapear a tecnologia     (0 máquina(s) analisada(s))
  ○ Etapa 3: Resolver pendências     (0 aberta(s), 0 resolvida(s))
  ○ Etapa 4: Montar o agente         (liberada quando a entrevista estiver completa)
  ○ Etapa 5: Revisar e entregar      (liberada depois de montar o agente)

O que você quer fazer?
  1. Continuar: Analisar este computador  ← recomendado
  2. Entrevista sobre o negócio
  3. Mapear a tecnologia (computador, rede ou bancos)
  4. Montar o agente (skills e consultas aos sistemas)
  5. Revisar e aprovar (servidor MCP)
  6. Ver e responder pendências
  7. Abrir o relatório no navegador
  8. Corrigir respostas da entrevista
  9. Como funciona?
  0. Sair
```

**Na dúvida, escolha sempre a opção 1.** A ferramenta sabe qual é o próximo passo.

### 4. Acompanhe pelo relatório

A opção **7** abre no navegador um relatório que mostra em que etapa você está, o que já se sabe sobre a empresa, o que foi encontrado nos computadores e o que ainda falta responder. Ele é atualizado sozinho a cada passo e pode ser enviado para a diretoria ou para o TI.

## Dicas para a entrevista

- **Não sabe uma resposta? Digite `?`.** A pergunta vira uma pendência, com a sugestão de quem pode responder. Não invente: uma resposta errada vira um assistente dando informação errada.
- **Pode parar quando quiser.** Digite `!sair` e, depois, escolha "Continuar" para retomar exatamente de onde parou.
- **Perguntas com números:** digite o número da opção. Quando dá para escolher várias, separe por vírgula: `1,3,4`.
- **Perguntas de lista:** separe os itens com ponto e vírgula: `Compras; Financeiro; RH`.

## Onde ficam os dados

Tudo fica **somente neste computador**, na pasta `workspaces/<nome-da-empresa>/`. Nada é enviado para a internet nas etapas 1 a 3.

## Próximas leituras

1. [Como funciona](02-como-funciona.md): a lógica do processo, etapa por etapa
2. [A entrevista](03-a-entrevista.md): o que cada nível pergunta, e por quê
3. [A análise técnica](04-analise-tecnica.md): o que é examinado nos computadores
4. [Segurança e privacidade](05-seguranca-e-privacidade.md)
5. [Perguntas frequentes](06-perguntas-frequentes.md)
6. [Glossário](07-glossario.md): MCP, agente, skill, guardrail... em português claro
7. [Atualização contínua](08-atualizacao-continua.md): como manter tudo em dia quando a empresa muda
8. [Skills](09-skills.md): o que o agente sabe fazer, e de onde isso vem
9. [Servidor MCP](10-servidor-mcp.md): revisar, aprovar e conectar o agente ao Claude
10. [Consultas aos sistemas](11-consultas.md): o agente responder com dados (status de pedido, estoque...)
