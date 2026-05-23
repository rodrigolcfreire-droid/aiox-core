abrqueca# SISTEMA AIOS — Documento Mestre

> Visão completa do sistema. Snapshot em 2026-04-29.
> Versão: aiox-core 4.4.6 · Branch: main

---

## 1. O que é o AIOS

**AIOS (AI-Orchestrated System)** — também chamado **Synkra AIOX** no namespace de pacote — é uma plataforma meta-de-desenvolvimento que combina:

1. **Framework de orquestração de agentes** (12 personas, 200+ tasks, 8 workflows YAML)
2. **Três motores autônomos de operação**: Intelligence, Briefing, Audiovisual
3. **Sistema IDS** (Incremental Development System) com hierarquia REUSE > ADAPT > CREATE sobre 751 entidades registradas
4. **SYNAPSE** — engine de contexto para roteamento por domínio/regra
5. **Centro de Comando UX** — suite de dashboards HTML para observar (não controlar) os motores
6. **Persistência multi-domínio** com 8 schemas Supabase isolados + RLS

**Filosofia inegociável (Constitution):**

```
CLI First  →  Observability Second  →  UI Third
```

A inteligência vive na CLI. Dashboards apenas observam. UI nunca é requisito de operação.

---

## 2. Estrutura de Camadas (Framework vs Project)

| Camada | Mutabilidade | Path | O que é |
|--------|--------------|------|---------|
| **L1** Framework Core | NEVER modify | `.aiox-core/core/`, `bin/aiox.js`, `bin/aiox-init.js`, `.aiox-core/constitution.md` | Núcleo protegido por deny rules |
| **L2** Framework Templates | NEVER modify | `.aiox-core/development/{tasks,templates,checklists,workflows}/`, `.aiox-core/infrastructure/` | Extend-only |
| **L3** Project Config | Mutable c/ exceções | `.aiox-core/data/`, `agents/*/MEMORY.md`, `core-config.yaml` | Configuração do projeto |
| **L4** Project Runtime | ALWAYS modify | `docs/stories/`, `packages/`, `squads/`, `tests/` | Trabalho do projeto |

Toggle via `core-config.yaml → boundary.frameworkProtection`.

---

## 3. Os Três Motores Autônomos

### 3.1 Intelligence Engine — monitoramento social

**Localização:** `bin/intelligence-*.js`, `bin/telegram-monitor.js`, `bin/whatsapp-monitor.js`
**Squads:** `squads/telegram/`, `squads/whatsapp/`, `squads/squad-espiao/`
**Schema Supabase:** `telegram`, `whatsapp` (RLS ativo)
**Modo:** **READ-ONLY** — bots observam e relatam, nunca interagem

CLIs principais:
- `intelligence-pipeline.js` — orquestrador unificado Telegram + WhatsApp
- `intelligence-dashboard.js` — gerador de relatórios
- `telegram-monitor.js` (~59k LOC) — análise de mensagens, sentimento, tendências
- `whatsapp-monitor.js` (~35k LOC) — equivalente WhatsApp
- `radar-editorial.js` — radar de conteúdo editorial
- `sentinel-report.js` — relatório auto-avaliativo

### 3.2 Briefing Engine — Máquina de Briefing

**Localização:** `squads/maquina-de-briefing/`
**Estrutura:** 11 agents + 9 cycle runs históricos + workflows + scripts
**Schema Supabase:** `briefing`, `personas`
**Função:** geração de briefings, ciclos editoriais, campanhas (ex.: Copa 2026)

Composição típica de ciclo: Scheduler → Generator → Reviewer → Output

### 3.3 Audiovisual Engine — Central Audiovisual

**Localização:** `squads/central-audiovisual/` + 25 binários `bin/av-*.js`
**Schema Supabase:** `audiovisual` (adicionado 2026-03-19)
**Pipeline:** ingest → transcribe → segment → cut → produce → edit → brand → scale → approve → output

CLIs do pipeline AV:
| Etapa | CLI | Função |
|-------|-----|--------|
| Ingest | `av-ingest.js`, `av-drive.js` | importa mídia (Drive incluso) |
| Transcrição | `av-transcribe.js` | speech-to-text |
| Segmentação | `av-segment.js`, `av-cuts.js`, `av-cortes.js` | cortes inteligentes |
| Smart cuts | `av-cortes.js` (~11k LOC) | cortes baseados em LLM |
| Produção | `av-produce.js`, `av-edit.js` (~13k LOC) | edição, transições |
| Escala/Mix | `av-escala.js`, `av-escala-mix.js` (~9k LOC) | Hook × Dev × CTA com IA |
| Brand/QA | `av-brand.js`, `av-performance.js`, `av-suggest.js` | compliance, métricas, sugestões |
| Aprovação | `av-approve.js`, `av-batch.js` | workflow de aprovação |
| Output | `av-output.js` | exportação final (inclui XML para Premiere) |
| Auth/API | `av-auth.js`, `av-server.js`, `av-dashboard-data.js` | infra da engine |

**Stories AV (av-1 → av-16):** schema, smart cuts, hooks, XML export, estimativa de tempo, legendas animadas, hook headline.

---

## 4. Sistema de Agentes

### 4.1 Personas (12 + master)

| ID | Persona | Escopo |
|----|---------|--------|
| `@dev` | Dex | Implementação |
| `@qa` | Quinn | Testes, quality gates |
| `@architect` | Aria | Arquitetura, design técnico |
| `@pm` | Morgan | Product Management, épicos |
| `@po` | Pax | Product Owner, stories |
| `@sm` | River | Scrum Master, sprint |
| `@analyst` | Alex | Pesquisa, análise |
| `@data-engineer` | Dara | DB, migrations |
| `@ux-design-expert` | Uma | UX/UI |
| `@devops` | Gage | CI/CD, **único com autoridade de `git push` e PRs** |
| `@aiox-master` | — | Override constitucional |
| `@autoavaliativo` | — | Auto-assessment, métricas |
| `@squad-creator` | — | Bootstrap de novas squads |

### 4.2 Autoridade (Agent Authority Matrix)

**`@devops` exclusivo:** `git push`, `gh pr create/merge`, MCP add/remove, CI/CD, releases.
**`@pm` exclusivo:** `*execute-epic`, `*create-epic`, requirements gathering, spec writing.
**`@po` exclusivo:** `*validate-story-draft` (10-point checklist), backlog priorities.
**`@sm` exclusivo:** `*draft` / `*create-story`.
**`@dev` permitido:** `git add/commit/branch/checkout/merge` LOCAL. Bloqueado: push e PR.

### 4.3 Handoff Protocol

Switch de agente compacta a persona anterior em artefato de ~379 tokens (vs ~3-5K). Máximo 3 summaries retidos. Storage: `.aiox/handoffs/`.

---

## 5. Squads (8 ativos + 1 template)

| Squad | Domínio |
|-------|---------|
| `central-audiovisual` | Pipeline AV completo (18 agents) |
| `maquina-de-briefing` | Briefings, ciclos editoriais, campanhas |
| `persona` | Definição de personas, segmentação |
| `squad-espiao` | Inteligência competitiva read-only |
| `telegram` | Integração Telegram (read-only) |
| `whatsapp` | Integração WhatsApp (read-only) |
| `claude-code-mastery` | Plugins, MCP, hooks Claude Code (8 agents) |
| `_example` | Template para novas squads |

---

## 6. Database — Supabase

### 6.1 Schemas (7+1, isolamento por domínio)

| Schema | Conteúdo | Migrations |
|--------|----------|------------|
| `auth` | Usuários (nativo Supabase) | — |
| `agents` | agents, agent_state, agent_metrics | 000002 |
| `memory` | memory, memory_segments | 000003 |
| `briefing` + `personas` | briefing_*, personas_* | 000007-000009 |
| `reports` + `workflow` | reports_*, workflows_*, workflow_logs | 000010-000012 |
| `system_logs` | system_logs, error_logs, audit_logs | 000013-000014 |
| `telegram` | telegram_messages, telegram_analysis | 0315000001-3 |
| `whatsapp` | whatsapp_messages, whatsapp_analysis | 0315100001-3 |
| `audiovisual` | av_projects, av_assets, av_timelines, av_edits, av_renders | 0319000001-3 |

**Total:** 24 migrations. RLS ativo em todos os schemas de domínio.

### 6.2 Auditoria

`bin/db-audit-security.js` (~14k LOC) — audita RLS, isolamento de dados, vulnerabilidades.

---

## 7. CLI — bin/ (43 executáveis, ~10k LOC)

### Núcleo
- `aiox.js` — CLI master (init, config, dispatcher)
- `aiox-init.js` — wizard greenfield/brownfield
- `aiox-minimal.js` — runner mínimo
- `aiox-ids.js` — resolver IDS (entity registry)
- `aiox-graph.js` — visualização de grafo de entidades
- `agent-panel.js` — gerador de dashboard HTML

### Pipeline & Reporting
- `intelligence-pipeline.js`, `intelligence-dashboard.js`
- `telegram-monitor.js`, `whatsapp-monitor.js`
- `sentinel-report.js`, `radar-editorial.js`

### Audiovisual (25 scripts av-*)
Ver seção 3.3.

### Database
- `db-audit-security.js`

---

## 8. Centro de Comando UX (`docs/examples/ux-command-center/`)

Suite de dashboards HTML estáticos. **Apenas observam — não controlam.**

| Dashboard | Função |
|-----------|--------|
| `index.html` | Hub principal (Home v2 em produção) |
| `av-approve.html` | Aprovação de cortes/edições |
| `av-editor.html` | Editor Growth (visual) |
| `av-escala-mix.html` | Hook × Dev × CTA (Escala Mix) |
| `av-live-pipeline.html` | Estado em tempo real do pipeline AV |
| `av-projects.html` | Lista de projetos AV |
| `av-workspace.html` | Workspace operacional |
| `setor-audiovisual-inteligente.html` | Setor AV (opção 3 aplicada — commit 46372c96) |
| `escala-mix-design-options.html` | Variantes de design Escala Mix |
| `renders-design-options.html` | Variantes de design de renders |
| `design-system/` | Mini design system |
| `reports/` | Relatórios gerados (relatório-{persona}-{data}.html) |

**Versão alternativa:** `docs/examples/ux-command-center-v2/`

**Reports atuais (snapshot):** caio-roleta, iristhaize, professor, suhaviator — datas 2026-04-19 a 2026-04-30.

---

## 9. Workflows

### 9.1 Workflows Primários

| # | Workflow | Fases | Quando usar |
|---|----------|-------|-------------|
| 1 | **Story Development Cycle (SDC)** | Create (@sm) → Validate (@po) → Implement (@dev) → QA Gate (@qa) | Toda story nova |
| 2 | **QA Loop** | review → verdict → fix → re-review (max 5) | Após QA gate inicial com pendências |
| 3 | **Spec Pipeline** | Gather (@pm) → Assess (@architect) → Research (@analyst) → Spec (@pm) → Critique (@qa) → Plan (@architect) | Feature complexa pré-implementação |
| 4 | **Brownfield Discovery** | 10 fases — coleta, draft, validação especialista, QA, finalização | Codebase legado |

### 9.2 Classificação de Complexidade (Spec Pipeline)

5 dimensões (Scope, Integration, Infrastructure, Knowledge, Risk) pontuadas 1-5:

| Score | Classe | Fases |
|-------|--------|-------|
| ≤8 | SIMPLE | gather → spec → critique |
| 9-15 | STANDARD | 6 fases completas |
| ≥16 | COMPLEX | 6 fases + revision cycle |

---

## 10. IDS (Incremental Development System)

**Hierarquia obrigatória:** REUSE > ADAPT > CREATE

**Registry:** `.aiox-core/data/entity-registry.yaml` — **751 entidades** com:
- SHA256 checksum
- Lifecycle stage (production / experimental)
- Adaptability scoring
- Last verified timestamp

**Gates:** G1-G6 (verificação progressiva antes de criar nova entidade).

CLI: `aiox-ids.js` resolve entidades; `aiox-graph.js` visualiza dependências.

---

## 11. Stories e Épicos

**Estado:** 41 stories em `docs/stories/` (mix active/completed).

### Linhas principais
- **Editor Growth** (eg-1 → eg-4): core data, presets, API, UI editor
- **Audiovisual** (av-1 → av-16): schema, smart cuts, XML export, hooks, legendas animadas
- **Database phases** (phase 1, 2, 5): foundation, core content, hardening
- **UX Group cycles**: cycle-002-cashback-roleta, scope-split, continuous improvement
- **Briefing** (9 ciclos rodados, incluindo Copa 2026)
- **Intelligence** (classification refinement, telegram-monitor-bots)

---

## 12. Configuração e Governança

### 12.1 Constitution (`.aiox-core/constitution.md`)

| Artigo | Princípio | Severidade |
|--------|-----------|------------|
| I | CLI First | NON-NEGOTIABLE |
| II | Agent Authority | NON-NEGOTIABLE |
| III | Story-Driven Development | MUST |
| IV | No Invention | MUST |
| V | Quality First | MUST |
| VI | Absolute Imports | SHOULD |

**Quality First gates obrigatórios:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, CodeRabbit sem CRITICAL.

### 12.2 Regras Claude (`.claude/rules/`)

10 arquivos: `ids-principles`, `coderabbit-integration`, `story-lifecycle`, `agent-authority`, `agent-handoff`, `agent-memory-imports`, `tool-response-filtering`, `tool-examples`, `workflow-execution`, `mcp-usage`.

### 12.3 SYNAPSE — Engine de Contexto

Pipeline de 8 layers. Domínios + regras + star-commands + context brackets. Localização: `.aiox-core/core/synapse/`, `.synapse/`.

### 12.4 Skills instaladas

`morning-briefing`, `checklist-runner`, `coderabbit-review`, `ui-ux-pro-max`, `architect-first`, `tech-search`, `synapse`, `skill-creator`, `mcp-builder`.

### 12.5 Tier Tool Mesh

| Tier | Carregamento | Exemplos |
|------|--------------|----------|
| 1 | Sempre | Read, Write, Edit, Bash, Grep, Glob, Task |
| 2 | Na ativação do agente | git, coderabbit, context7, supabase |
| 3 | Sob demanda | EXA, Playwright, Apify, Nogic, Code-Graph |

---

## 13. Stack Técnica

### 13.1 Linguagem & Runtime
- Node.js (CommonJS, ES2022)
- TypeScript (com `tsc --noEmit` no quality gate)
- Convenção: 2-space indent, single quotes, semicolons, kebab-case files, PascalCase components, SCREAMING_SNAKE_CASE constants
- Imports absolutos com alias `@/` (sem relativos)

### 13.2 Persistência
- Supabase (Postgres + RLS)
- 8 schemas isolados

### 13.3 Test
- Jest (`jest.config.js`)
- Mocha (health-check)
- 32 categorias em `tests/` (agents, audiovisual, cli, core, e2e, code-intel, ids, security, synapse, hooks, integration, performance, ...)

### 13.4 Quality Pipeline
- ESLint (`eslint.config.js`)
- Prettier (`.prettierrc`)
- Husky pre-commit
- CodeRabbit (`.coderabbit.yaml`) — auto-fix max 2 iterações
- Semantic-release (`.releaserc.json`)

### 13.5 IDEs Suportadas (sync via `aiox-core/infrastructure/scripts/ide-sync/`)
- Claude Code (primário)
- Codex
- Gemini
- GitHub Copilot
- Antigravity
- Cursor

### 13.6 Pacotes NPM (`packages/`)
- `@synkra/aiox-install` — instalador NPX
- `aiox-pro` — ativação de licença e features pro
- `@aiox/installer` — wizard avançado

---

## 14. Estado Operacional Atual (2026-04-29)

### Branch: `main`
### Working tree
- 8 arquivos modificados (UX command center, reports, entity-registry, av-escala-mix.html, index.html)
- 12+ relatórios novos (caio-roleta, iristhaize, professor, suhaviator: 2026-04-20 → 2026-04-30)
- 2 arquivos novos de design options (escala-mix, renders)

### Últimos commits
- `46372c96` feat(ux): opção 3 setor audiovisual + cleanup blocos escala
- `109d3632` chore(ux): remover Pipeline Completa e 7 Categorias de Corte
- `17035421` docs(tech-debt): tests audiovisual quebrados pos-auth-close
- `b71a955a` feat(ux): mini design system + home v2 aplicada
- `33b760dd` fix(escala-mix): await renderCombo

### Pendências conhecidas (memória)
- Editor Growth + Escala Mix (Hook×Dev×CTA com IA) e biblioteca `assets-editor/` ainda **não-commitados**
- 2 testes audiovisual quebrados pós-fechamento de auth (registrado em tech-debt)
- Bots Telegram/WhatsApp confirmados em modo read-only

---

## 15. Comandos Frequentes

```bash
# Desenvolvimento
npm run dev
npm test
npm run lint
npm run typecheck
npm run build

# AIOX
npx aiox-core install
npx aiox-core doctor
npx aiox-core info

# IDE Sync
npm run sync:ide
npm run sync:ide:claude
npm run validate:claude-sync

# Validação
npm run validate:structure
npm run validate:agents
npm run validate:paths
npm run validate:parity
npm run validate:semantic-lint
```

---

## 16. Como Tudo se Conecta

```
┌─────────────────────────────────────────────────────────────┐
│                      CONSTITUTION                            │
│  (CLI First · Agent Authority · No Invention · Quality)      │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │ AGENTS  │ ◄────► │   IDS    │ ◄────► │ SYNAPSE │
   │ (12+1)  │         │ Registry │         │ Context │
   └────┬────┘         └─────────┘         └─────────┘
        │
        ▼
   ┌────────────────────────────────────────────────┐
   │              WORKFLOWS                          │
   │  SDC · QA Loop · Spec Pipeline · Brownfield     │
   └────┬────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────┐
   │           STORIES (docs/stories/)               │
   └────┬────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────┐
   │      EXECUTION LAYER (CLI - bin/*.js)           │
   ├────────────────────────────────────────────────┤
   │  Intelligence  │   Briefing   │   Audiovisual  │
   │  (Telegram +   │  (Máquina    │  (25 av-*.js   │
   │   WhatsApp     │   de         │   pipeline     │
   │   read-only)   │   Briefing)  │   completo)    │
   └────┬────────────┬──────────────┬───────────────┘
        ▼            ▼              ▼
   ┌────────────────────────────────────────────────┐
   │              SUPABASE (8 schemas + RLS)         │
   │  agents · memory · briefing · personas ·        │
   │  reports · workflow · system_logs · telegram ·  │
   │  whatsapp · audiovisual                         │
   └────┬────────────────────────────────────────────┘
        │
        ▼ (apenas observação)
   ┌────────────────────────────────────────────────┐
   │         UX COMMAND CENTER (HTML estático)       │
   │  Dashboards: AV pipeline, projects, escala-mix, │
   │  reports, design system                          │
   └────────────────────────────────────────────────┘
```

---

## 17. Pontos de Atenção

1. **Trabalho não-committado** em Editor Growth e Escala Mix exposto a perda — ver session 2026-04-13 na memória.
2. **Tests audiovisual quebrados** pós-auth-close — tech-debt registrado em `2026-04-19`.
3. **Bots em produção (Telegram/WhatsApp) são read-only** — qualquer modificação pode violar essa regra. Memória `feedback_telegram_readonly.md` reforça.
4. **`@devops` é único com autoridade de push/PR** — qualquer agent que tente push direto viola Constitution Article II.
5. **No Invention (Article IV)** — todo statement em spec.md deve traçar para FR/NFR/CON/research finding.

---

*Documento gerado em 2026-04-29 a partir do estado real do repositório.*
*Para diagnóstico operacional diário, executar `/morning-briefing`.*
