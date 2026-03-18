# Documentação Técnica Consolidada

## Escopo
Documento consolidado do AIOX contendo:
- lista de agentes
- funções
- pipeline
- ferramentas conectadas
- base de conhecimento
- fluxos de execução

## 1) Lista de Agentes Oficiais
Fonte primária: `.aiox-core/development/agents/*.md`

| ID | Nome | Título |
|---|---|---|
| `aiox-master` | Orion | AIOX Master Orchestrator & Framework Developer |
| `analyst` | Atlas | Business Analyst |
| `architect` | Aria | Architect |
| `data-engineer` | Dara | Database Architect & Operations Engineer |
| `dev` | Dex | Full Stack Developer |
| `devops` | Gage | GitHub Repository Manager & DevOps Specialist |
| `pm` | Morgan | Product Manager |
| `po` | Pax | Product Owner |
| `qa` | Quinn | Test Architect & Quality Advisor |
| `sm` | River | Scrum Master |
| `squad-creator` | Craft | Squad Creator |
| `ux-design-expert` | Uma | UX/UI Designer & Design System Architect |

## 2) Funções dos Agentes
Fonte primária: `role` e dependências nos YAMLs dos agentes + Constitution.

| Agente | Função principal | Autoridade/limite relevante |
|---|---|---|
| `aiox-master` | Orquestração transversal, criação/modificação de componentes do framework | Coordena domínios; segue constitution como guardrail |
| `analyst` | Pesquisa, análise de mercado/usuário, ideação estruturada | Foco em descoberta e definição analítica |
| `architect` | Arquitetura fullstack, decisões técnicas estruturais, APIs e infra | Sem push remoto |
| `data-engineer` | Modelagem de dados, SQL/migrações, RLS, performance de banco | Sem push remoto |
| `dev` | Implementação de stories, refatoração, testes e correções | Operações git locais; sem `git push` |
| `devops` | Governança de repositório, PR/release/CI/CD e quality gate pré-push | Único autorizado para `git push`, PR e release |
| `pm` | Estratégia de produto, PRD, roadmap e priorização macro | Sem foco em operações git |
| `po` | Gestão de backlog, refinamento de story e critérios de aceite | Sem push remoto |
| `qa` | Arquitetura de testes, análise de risco e parecer de qualidade | Revisão/validação; sem push remoto |
| `sm` | Preparação de stories, facilitação do fluxo e gestão de sprint | Pode gerir branch local; sem push remoto |
| `squad-creator` | Criação/publicação/evolução de squads | Mantém consistência de estrutura e contratos |
| `ux-design-expert` | UX/UI, design system, tokens e qualidade de interface | Foco em experiência e consistência visual |

## 3) Pipeline

### 3.1 Pipeline de Ativação de Agentes (UAP)
Fonte primária: `.aiox-core/development/scripts/unified-activation-pipeline.js` e traço técnico em `docs/guides/agents/traces/00-shared-activation-pipeline.md`.

Fluxo resumido:
1. Entrada única: `activate(agentId)`.
2. Carga paralela de contexto (config de agente, contexto de sessão, status de projeto, git config, modo de permissão).
3. Etapas sequenciais dependentes (preferência de greeting, tipo de sessão, estado de workflow).
4. Montagem de `enrichedContext`.
5. Geração final do greeting/contexto via `GreetingBuilder`.

Observações:
- `generate-greeting.js` atua como wrapper fino para retrocompatibilidade.
- Há fallback em timeout e degradação graciosa quando alguma fonte de contexto falha.

### 3.2 Pipeline de Desenvolvimento (Story-Driven)
Fonte primária: `.aiox-core/constitution.md` e `.aiox-core/development/workflows/*.yaml`.

Fluxo base:
1. Início obrigatório por story (`docs/stories/`).
2. Implementação estritamente pelos acceptance criteria.
3. Atualização de checklist e file list.
4. Quality gates obrigatórios antes de concluir.

Quality gates mandatórios:
- `npm run lint`
- `npm run typecheck`
- `npm test`

## 4) Ferramentas Conectadas

### 4.1 Ferramentas por categoria
Fonte primária: `docs/pt/architecture/agent-tool-integration-guide.md` + YAMLs de agentes.

CLI:
- `git`, `github-cli`, `docker`, `npm`, `jest`, `ffmpeg`, `psql`, `pg_dump`, `supabase-cli`

MCP / contexto externo:
- `exa`
- `context7`
- `browser` / Playwright
- `apify`
- `docker-gateway` (gestão MCP)

Serviços e integrações:
- `coderabbit`
- `supabase`
- `n8n`
- `google-workspace`
- `clickup`
- `21st-dev-magic`

### 4.2 Integração multi-IDE
Fonte primária: scripts em `package.json`.

Conectores/sync suportados:
- Claude Code
- Codex
- Gemini
- Cursor
- GitHub Copilot
- Antigravity

Comandos-chave:
- `npm run sync:ide`
- `npm run sync:ide:check`
- `npm run validate:parity`
- `npm run validate:codex-sync && npm run validate:codex-integration`
- `npm run sync:skills:codex`

## 5) Base de Conhecimento

### 5.1 Fontes estruturadas (source of truth)
- Constituição: `.aiox-core/constitution.md`
- Definições de agentes: `.aiox-core/development/agents/`
- Tasks operacionais: `.aiox-core/development/tasks/`
- Workflows: `.aiox-core/development/workflows/`
- Checklists: `.aiox-core/product/checklists/`
- Templates: `.aiox-core/product/templates/`
- Documentação funcional/arquitetural: `docs/`
- Squads customizados e assets de execução: `squads/`

### 5.2 Camada de memória/conhecimento operacional
Fonte primária: `docs/guides/MEMORY-SYSTEM.md`, `docs/guides/MEMORY-INTEGRATION.md`, `docs/guides/MEMORY-INTELLIGENCE-SYSTEM.md`.

Camadas:
- Memória nativa do runtime de agente (transcripts e memória de sessão).
- Memória de framework AIOX (`.aiox/`) para estado de sessão, snapshots, timeline e gotchas.
- Extensão Open Core/Pro para retrieval progressivo, escopo por agente e feature gating de memória avançada.

## 6) Fluxos de Execução

### 6.1 Fluxo de ativação de agente
1. Usuário ativa agente.
2. UAP enriquece contexto com estado de sessão/projeto/permissões.
3. Agente inicia com greeting contextual e comandos do domínio.

### 6.2 Fluxo de desenvolvimento por story
1. `@sm`/`@po` estruturam story e critérios.
2. `@dev` implementa e testa localmente.
3. `@qa` valida riscos, cobertura e aderência aos critérios.
4. `@devops` executa gates finais, push remoto, PR e release (quando aplicável).

### 6.3 Fluxo de governança de git
1. Trabalho e commits locais em branch de feature.
2. Push remoto somente via `@devops`.
3. PR/merge/release somente via `@devops`.
4. Regras reforçadas por constitution + hooks + definições de agente.

### 6.4 Fluxo de sincronização de ecossistema
1. Atualização de agentes/rules/templates no core.
2. Execução de `sync:ide` para propagar para IDEs alvo.
3. Execução de validadores de sync/integration/parity.
4. Correção de drift e republicação de artefatos.

## 7) Referências Diretas
- `.aiox-core/constitution.md`
- `.aiox-core/development/agents/`
- `.aiox-core/development/workflows/`
- `.aiox-core/development/tasks/`
- `docs/pt/architecture/agent-tool-integration-guide.md`
- `docs/pt/architecture/agent-responsibility-matrix.md`
- `docs/guides/agents/traces/00-shared-activation-pipeline.md`
- `docs/guides/MEMORY-SYSTEM.md`
- `docs/guides/MEMORY-INTEGRATION.md`
- `docs/guides/MEMORY-INTELLIGENCE-SYSTEM.md`
- `package.json`
