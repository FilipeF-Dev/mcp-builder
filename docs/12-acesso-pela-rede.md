# Acesso pela rede: vários colaboradores

O servidor MCP funciona de dois jeitos:

| Modo | Atende | Quando usar |
|---|---|---|
| **Local** (padrão) | Uma pessoa, no próprio computador, pelo Claude Desktop | Testes, TI, uso individual |
| **HTTP** | Vários colaboradores ao mesmo tempo | Agente central, integração com Teams, intranet ou um assistente da empresa |

Este guia é sobre o **modo HTTP**. Ele é mais poderoso e, por isso, tem mais proteções.

## Como funciona, em uma frase

O servidor fica ligado num computador da empresa e responde em um endereço (ex.: `https://mcp.empresa.local:3333/mcp`). Cada pessoa ou aplicação usa uma **chave de acesso** própria, e a auditoria registra quem perguntou o quê.

## Passo a passo

### 1. Crie as chaves de acesso

No menu: **5. Revisar e entregar → 2. Acesso pela rede → Criar chave**.

Dê um nome que diga **para quem** é a chave: `teams`, `intranet`, `maria-rh`. A chave aparece **uma única vez**:

```
✓ Chave criada. Copie AGORA: ela não será mostrada de novo.

  mcp_kd8Hn2...
```

- Entregue a chave por um canal seguro (nunca por e-mail aberto ou grupo de mensagens).
- O MCP-Builder e o servidor guardam só um **resumo** (hash) da chave, que não serve para acessar. Mesmo quem abrir os arquivos do servidor não consegue usar as chaves.
- Perdeu a chave? Revogue e crie outra.

### 2. Inicie o servidor no modo HTTP

Na pasta do servidor (`saida/servidor-mcp`):

- **Windows:** dois cliques em `iniciar-http.bat`
- **Linux:** `./iniciar-http.sh`

Por padrão, ele atende **só no próprio computador**: `http://127.0.0.1:3333/mcp`. Para testar se está no ar, abra `http://127.0.0.1:3333/saude` no navegador. A resposta é `{"ok":true}`.

Se houver consultas aos sistemas, defina antes as variáveis de banco (`MCP_DB_<BANCO>_USUARIO` e `_SENHA`) no ambiente do computador ou do serviço. O `LEIA-ME.md` do servidor mostra os nomes exatos.

### 3. Para atender outros computadores: HTTPS

Para aceitar conexões da rede, o servidor **exige HTTPS**, porque a chave não pode trafegar sem criptografia. Há duas formas:

**a) Certificado no próprio servidor:**

| Variável | Valor |
|---|---|
| `MCP_HTTP_HOST` | `0.0.0.0` (aceitar conexões da rede) |
| `MCP_HTTPS_CERT` | caminho do certificado (`.pem`) |
| `MCP_HTTPS_CHAVE` | caminho da chave privada do certificado (`.pem`) |
| `MCP_HTTP_NOMES` | o nome pelo qual o servidor é chamado, ex.: `mcp.empresa.local` |

**b) Atrás de um proxy HTTPS** (IIS, nginx, o que o TI já usa): o proxy cuida do certificado e repassa para `127.0.0.1:3333`. Defina `MCP_HTTP_SEM_TLS=1` e `MCP_HTTP_NOMES` com o nome público.

Sem uma dessas duas formas, o servidor **se recusa a abrir na rede** e explica o motivo.

### 4. Deixe o servidor sempre ligado

Peça ao TI para rodar como **serviço**, para ele voltar sozinho depois de um reinício (por exemplo NSSM no Windows ou systemd no Linux), e para liberar a porta no firewall **só** para os computadores que precisam.

## As proteções do modo HTTP

| Proteção | O que faz |
|---|---|
| **Chave obrigatória** | Sem chave válida, a resposta é "não autorizado" (401). Sem nenhuma chave criada, o servidor nem inicia. |
| **Só o hash da chave é guardado** | Arquivos vazados não dão acesso |
| **Comparação em tempo constante** | Não dá para "adivinhar" a chave medindo o tempo de resposta |
| **Só localhost por padrão** | Abrir na rede é uma decisão explícita |
| **HTTPS obrigatório na rede** | A chave e as respostas trafegam criptografadas |
| **Proteção contra DNS rebinding** | Um site malicioso aberto no navegador de alguém não consegue usar o servidor (responde 403) |
| **Limite por chave** (60 requisições por minuto, ajustável) | Evita abuso ou um robô travando o servidor (responde 429) |
| **Limite de tamanho** (1 MB por requisição) | Evita requisições gigantes |
| **Sem estado entre requisições** | Cada requisição é atendida isoladamente: um colaborador nunca vê nada do outro |
| **Auditoria por pessoa** | Cada linha do log registra **quem** (nome da chave), quando, qual ferramenta e os argumentos já mascarados |

Todas as proteções do servidor continuam valendo: só o aprovado, somente leitura e mascaramento de dados sensíveis.

## Tirar o acesso de alguém

**5. Revisar e entregar → 2. Acesso pela rede → Revogar chave** e reinicie o servidor HTTP.

## Comandos avançados

```bash
mcp-builder servidor chave nova teams
mcp-builder servidor chave listar
mcp-builder servidor chave revogar teams
```

## Conectar um cliente

Qualquer cliente compatível com MCP por HTTP ("Streamable HTTP") funciona: basta o endereço `/mcp` e o cabeçalho `Authorization: Bearer <chave>`. A integração com Teams ou intranet normalmente é feita por quem desenvolve o assistente da empresa, usando esse endereço e uma chave própria.
