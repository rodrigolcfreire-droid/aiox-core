<!--
  Tradução: PT-BR
  Original: /docs/en/guides/mcp-global-setup.md
  Última sincronização: 2026-01-26
-->

# Guia de Configuração Global MCP do AIOS

> Configure servidores MCP (Model Context Protocol) globais para Synkra AIOS.

**Versão:** 2.1.1
**Última Atualização:** 2025-12-23
**Story:** [2.16 - Documentation Sprint 2](../stories/v2.1/sprint-2/story-2.16-documentation.md)

---

## Visão Geral

O Sistema Global MCP permite que você configure servidores MCP uma única vez e os compartilhe entre todos os projetos AIOS. Isso elimina a necessidade de configurar os mesmos servidores em cada projeto.

### Benefícios

| Benefício | Descrição |
|-----------|-----------|
| **Configuração Única** | Configure servidores uma vez, use em todos os lugares |
| **Configurações Consistentes** | Mesmas configurações de servidor em todos os projetos |
| **Gerenciamento de Credenciais** | Armazenamento seguro e centralizado de credenciais |
| **Atualizações Fáceis** | Atualize versões de servidores em um único lugar |

### Estrutura de Diretórios Global

```
~/.aios/
├── mcp/
│   ├── global-config.json    # Arquivo de configuração principal
│   ├── servers/              # Configurações individuais de servidores
│   │   ├── context7.json
│   │   ├── exa.json
│   │   └── github.json
│   └── cache/                # Cache de respostas de servidores
└── credentials/              # Armazenamento seguro de credenciais
    └── .gitignore            # Previne commits acidentais
```

---

## Caminhos Específicos por Plataforma

### Windows

```
C:\Users\<username>\.aios\mcp\global-config.json
C:\Users\<username>\.aios\mcp\servers\
C:\Users\<username>\.aios\credentials\
```

### macOS

```
/Users/<username>/.aios/mcp/global-config.json
/Users/<username>/.aios/mcp/servers/
/Users/<username>/.aios/credentials/
```

### Linux

```
/home/<username>/.aios/mcp/global-config.json
/home/<username>/.aios/mcp/servers/
/home/<username>/.aios/credentials/
```

---

## Configuração Inicial

### Passo 1: Criar Estrutura Global

```bash
# Create global directory and config
aios mcp setup
```

**Isso cria:**
- `~/.aios/` - Diretório global do AIOS
- `~/.aios/mcp/` - Diretório de configuração MCP
- `~/.aios/mcp/global-config.json` - Arquivo de configuração principal
- `~/.aios/mcp/servers/` - Configurações individuais de servidores
- `~/.aios/mcp/cache/` - Cache de respostas
- `~/.aios/credentials/` - Armazenamento seguro de credenciais

### Passo 2: Verificar Configuração

```bash
# Check global config exists
aios mcp status
```

**Saída Esperada:**
```
MCP Global Configuration
========================

Location: ~/.aios/mcp/global-config.json
Status:   ✓ Configured

Servers: 0 configured
Cache:   Empty

Run 'aios mcp add <server>' to add servers.
```

---

## Adicionando Servidores MCP

### Usando Templates

O AIOS inclui templates para servidores MCP populares:

```bash
# Add from template
aios mcp add context7
aios mcp add exa
aios mcp add github
aios mcp add puppeteer
aios mcp add filesystem
aios mcp add memory
aios mcp add desktop-commander
```

### Templates Disponíveis

| Template | Tipo | Descrição |
|----------|------|-----------|
| `context7` | SSE | Consultas de documentação de bibliotecas |
| `exa` | Command | Busca web avançada |
| `github` | Command | Integração com API do GitHub |
| `puppeteer` | Command | Automação de navegador |
| `filesystem` | Command | Acesso ao sistema de arquivos |
| `memory` | Command | Armazenamento temporário em memória |
| `desktop-commander` | Command | Automação de desktop |

### Configuração Personalizada de Servidor

```bash
# Add custom server with JSON config
aios mcp add my-server --config='{"command":"npx","args":["-y","my-mcp-server"]}'

# Add from config file
aios mcp add my-server --config-file=./my-server-config.json
```

---

## Comandos CLI

### `aios mcp setup`

Inicializa a configuração global MCP.

```bash
# Create global structure
aios mcp setup

# Force recreate (backup existing)
aios mcp setup --force

# Specify custom location
aios mcp setup --path=/custom/path
```

### `aios mcp add`

Adiciona um novo servidor MCP.

```bash
# Add from template
aios mcp add context7

# Add with custom config
aios mcp add custom-server --config='{"command":"npx","args":["-y","package"]}'

# Add with environment variables
aios mcp add exa --env='EXA_API_KEY=your-key'
```

### `aios mcp remove`

Remove um servidor MCP.

```bash
# Remove server
aios mcp remove context7

# Remove with confirmation skip
aios mcp remove context7 --yes
```

### `aios mcp list`

Lista servidores configurados.

```bash
# List all servers
aios mcp list

# List with details
aios mcp list --verbose

# List only enabled
aios mcp list --enabled
```

**Saída:**
```
Configured MCP Servers
======================

  context7     [enabled]  SSE  https://mcp.context7.com/sse
  exa          [enabled]  CMD  npx -y exa-mcp-server
  github       [disabled] CMD  npx -y @modelcontextprotocol/server-github

Total: 3 servers (2 enabled, 1 disabled)
```

### `aios mcp enable/disable`

Habilita ou desabilita servidores.

```bash
# Disable server
aios mcp disable github

# Enable server
aios mcp enable github

# Toggle
aios mcp toggle github
```

### `aios mcp status`

Mostra status global do MCP.

```bash
# Full status
aios mcp status

# JSON output
aios mcp status --json
```

### `aios mcp sync`

Sincroniza configuração global para o projeto.

```bash
# Sync to current project
aios mcp sync

# Sync specific servers only
aios mcp sync --servers=context7,exa
```

---

## Arquivos de Configuração

### global-config.json

Arquivo de configuração principal com todas as definições de servidores.

```json
{
  "version": "1.0",
  "servers": {
    "context7": {
      "type": "sse",
      "url": "https://mcp.context7.com/sse",
      "enabled": true
    },
    "exa": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "${EXA_API_KEY}"
      },
      "enabled": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true
    }
  },
  "defaults": {
    "timeout": 30000,
    "retries": 3
  }
}
```

### Arquivos Individuais de Servidor

Cada servidor também possui seu próprio arquivo de configuração em `servers/`:

```json
// ~/.aios/mcp/servers/context7.json
{
  "type": "sse",
  "url": "https://mcp.context7.com/sse",
  "enabled": true
}
```

---

## Tipos de Servidor

### SSE (Server-Sent Events)

Para servidores que fornecem um endpoint HTTP de streaming.

```json
{
  "type": "sse",
  "url": "https://mcp.server.com/sse",
  "enabled": true
}
```

### Command

Para servidores que executam como processos locais.

```json
{
  "command": "npx",
  "args": ["-y", "@package/mcp-server"],
  "env": {
    "API_KEY": "${API_KEY}"
  },
  "enabled": true
}
```

### Wrapper de Comando Windows

Para Windows, use o wrapper CMD para NPX:

```json
{
  "command": "cmd",
  "args": [
    "/c",
    "npx-wrapper.cmd",
    "-y",
    "@package/mcp-server"
  ],
  "env": {
    "API_KEY": "${API_KEY}"
  },
  "enabled": true
}
```

---

## Variáveis de Ambiente

### Usando Variáveis na Configuração

Referencie variáveis de ambiente usando a sintaxe `${VAR_NAME}`:

```json
{
  "env": {
    "API_KEY": "${MY_API_KEY}",
    "TOKEN": "${MY_TOKEN}"
  }
}
```

### Definindo Variáveis

**Windows (PowerShell):**
```powershell
$env:EXA_API_KEY = "your-api-key"
$env:GITHUB_TOKEN = "your-github-token"
```

**Windows (CMD):**
```cmd
set EXA_API_KEY=your-api-key
set GITHUB_TOKEN=your-github-token
```

**macOS/Linux:**
```bash
export EXA_API_KEY="your-api-key"
export GITHUB_TOKEN="your-github-token"
```

### Variáveis Persistentes

**Windows:** Adicione às Variáveis de Ambiente do Sistema

**macOS/Linux:** Adicione ao `~/.bashrc`, `~/.zshrc`, ou `~/.profile`:
```bash
export EXA_API_KEY="your-api-key"
export GITHUB_TOKEN="your-github-token"
```

---

## Gerenciamento de Credenciais

### Armazenamento Seguro

Credenciais são armazenadas em `~/.aios/credentials/` com um `.gitignore` para prevenir commits acidentais.

```bash
# Add credential
aios mcp credential set EXA_API_KEY "your-api-key"

# Get credential
aios mcp credential get EXA_API_KEY

# List credentials (masked)
aios mcp credential list
```

### Formato do Arquivo de Credenciais

```json
// ~/.aios/credentials/api-keys.json
{
  "EXA_API_KEY": "encrypted-value",
  "GITHUB_TOKEN": "encrypted-value"
}
```

---

## Uso Programático

### API JavaScript

```javascript
const {
  globalDirExists,
  globalConfigExists,
  createGlobalStructure,
  readGlobalConfig,
  addServer,
  removeServer,
  listServers
} = require('./.aios-core/core/mcp/global-config-manager');

// Check if setup exists
if (!globalDirExists()) {
  createGlobalStructure();
}

// Add server
addServer('my-server', {
  command: 'npx',
  args: ['-y', 'my-mcp-server'],
  enabled: true
});

// List servers
const { servers, total, enabled } = listServers();
console.log(`${enabled}/${total} servers enabled`);

// Remove server
removeServer('my-server');
```

### Detecção de SO

```javascript
const {
  detectOS,
  isWindows,
  isMacOS,
  isLinux,
  getGlobalMcpDir,
  getGlobalConfigPath
} = require('./.aios-core/core/mcp/os-detector');

// Get OS type
console.log(detectOS()); // 'windows' | 'macos' | 'linux'

// Get paths
console.log(getGlobalMcpDir());     // ~/.aios/mcp/
console.log(getGlobalConfigPath()); // ~/.aios/mcp/global-config.json
```

---

## Solução de Problemas

### Problemas de Configuração

| Problema | Solução |
|----------|---------|
| Permissão negada | Execute o terminal como Administrador (Windows) ou use sudo (macOS/Linux) |
| Diretório já existe | Use `aios mcp setup --force` para recriar |
| Caminho não encontrado | Certifique-se de que o diretório home existe |

### Problemas de Servidor

| Problema | Solução |
|----------|---------|
| Servidor não inicia | Verifique comando e args, confirme que o pacote está instalado |
| Variável de ambiente não encontrada | Defina a variável ou use armazenamento de credenciais |
| Erros de timeout | Aumente o timeout na configuração |
| Conexão recusada | Verifique URL e acesso à rede |

### Problemas Específicos do Windows

| Problema | Solução |
|----------|---------|
| NPX não encontrado | Adicione Node.js ao PATH, use wrapper CMD |
| Erros de symlink | Habilite Modo Desenvolvedor ou use junctions |
| Caminho muito longo | Habilite caminhos longos no registro |

### Correções Comuns

```bash
# Reset global config
aios mcp setup --force

# Clear cache
rm -rf ~/.aios/mcp/cache/*

# Verify config
aios mcp status --verbose

# Test server manually
npx -y @modelcontextprotocol/server-github
```

### Problemas do Docker MCP Toolkit

| Problema | Solução |
|----------|---------|
| Secrets não passados para containers | Edite o arquivo de catálogo diretamente (veja abaixo) |
| Interpolação de template falhando | Use valores hardcoded no catálogo |
| Tools mostrando como "(N prompts)" | Token não está sendo passado - aplique o workaround |

#### Bug de Secrets do Docker MCP (Dez 2025)

**Problema:** O armazenamento de secrets do Docker MCP Toolkit (`docker mcp secret set`) e interpolação de templates (`{{...}}`) NÃO funcionam corretamente. Credenciais não são passadas para containers.

**Sintomas:**
- `docker mcp tools ls` mostra "(N prompts)" em vez de "(N tools)"
- Servidor MCP inicia mas falha na autenticação
- Saída verbose mostra `-e ENV_VAR` sem valores

**Workaround:** Edite `~/.docker/mcp/catalogs/docker-mcp.yaml` diretamente:

```yaml
{mcp-name}:
  env:
    - name: API_TOKEN
      value: 'actual-token-value-here'
```

**Exemplo - Apify:**
```yaml
apify-mcp-server:
  env:
    - name: TOOLS
      value: 'actors,docs,apify/rag-web-browser'
    - name: APIFY_TOKEN
      value: 'apify_api_xxxxxxxxxxxxx'
```

**Nota:** Isso expõe credenciais em um arquivo local. Proteja permissões do arquivo e nunca faça commit deste arquivo.

---

## Integração com IDE

### Claude Desktop

Adicione às configurações do Claude Desktop:

```json
{
  "mcpServers": {
    "aios-global": {
      "command": "aios",
      "args": ["mcp", "serve", "--global"]
    }
  }
}
```

### VS Code

Configure em `.vscode/settings.json`:

```json
{
  "aios.mcp.useGlobal": true,
  "aios.mcp.globalPath": "~/.aios/mcp/global-config.json"
}
```

### Sobrescrita Específica de Projeto

Crie `.mcp.json` na raiz do projeto para sobrescrever configurações globais:

```json
{
  "inherit": "global",
  "servers": {
    "context7": {
      "enabled": false
    },
    "project-specific": {
      "command": "node",
      "args": ["./local-mcp-server.js"]
    }
  }
}
```

---

## Boas Práticas

1. **Use templates** para servidores comuns
2. **Armazene credenciais com segurança** no diretório de credenciais
3. **Desabilite servidores não utilizados** para reduzir uso de recursos
4. **Mantenha servidores atualizados** com versões mais recentes dos pacotes
5. **Use sobrescritas de projeto** para necessidades específicas de projeto
6. **Faça backup da configuração** antes de grandes mudanças

---

## Documentação Relacionada

- [Arquitetura do Sistema de Módulos](../architecture/module-system.md)
- [Story 2.11: MCP System Global](../stories/v2.1/sprint-2/story-2.11-mcp-system-global.md)
- [Diagramas de Arquitetura MCP](../architecture/mcp-system-diagrams.md)

---

*Synkra AIOS v2.1 Guia de Configuração Global MCP*
