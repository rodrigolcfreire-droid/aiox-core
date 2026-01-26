<!-- Tradução: PT-BR | Original: /docs/en/architecture/ARCHITECTURE-INDEX.md | Sincronização: 2026-01-26 -->

# Índice da Documentação de Arquitetura do AIOS

**Versão:** 2.1.1
**Última Atualização:** 2025-12-14
**Status:** Referência Oficial

---

## Navegação de Documentos

Este índice fornece navegação para toda a documentação de arquitetura do AIOS v2.1.

> **Nota:** A documentação oficial do framework (coding-standards, tech-stack, source-tree) foi consolidada em `docs/framework/`. Veja o [README do Framework](../framework/README.md) para detalhes.

---

## Estrutura de Diretórios

```
docs/architecture/
├── ARCHITECTURE-INDEX.md     # Este arquivo
├── mcp-system-diagrams.md    # Diagramas de arquitetura MCP
├── mcp-api-keys-management.md # Gerenciamento de chaves de API
├── high-level-architecture.md # Visão geral do sistema
├── module-system.md          # Arquitetura de 4 módulos
├── multi-repo-strategy.md    # Estrutura de repositórios
├── decisions/                # Decisões arquiteturais (ADRs)
└── [deprecated]              # source-tree.md, coding-standards.md, tech-stack.md
                              # (use as versões em docs/framework/)
```

> **Análise Arquivada:** Documentos legados de otimização MCP (1MCP) movidos para `.github/deprecated-docs/architecture/analysis/`

---

## Links Rápidos por Tópico

### Arquitetura Principal

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Arquitetura de Alto Nível](./high-level-architecture.md) | Visão geral da arquitetura AIOS v2.1 | ✅ Atual |
| [Sistema de Módulos](./module-system.md) | Arquitetura modular de 4 módulos | ✅ Atual |
| [Estratégia Multi-Repo](./multi-repo-strategy.md) | 3 repos públicos + 2 privados | ✅ Atual |
| [Estratégia Multi-Repo (PT-BR)](./multi-repo-strategy-pt.md) | Versão em português | ✅ Atual |

### MCP e Integrações

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Diagramas do Sistema MCP](./mcp-system-diagrams.md) | Diagramas de arquitetura MCP | ✅ Atual |
| [Gerenciamento de Chaves API MCP](./mcp-api-keys-management.md) | Gerenciamento de chaves de API | ✅ Atual |

> **Nota:** O gerenciamento de MCP é feito via Docker MCP Toolkit (Story 5.11). Use o agente `@devops` com `*setup-mcp-docker` para configuração. Documentos legados do 1MCP arquivados em `.github/deprecated-docs/`.

### Sistema de Agentes

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Matriz de Responsabilidade de Agentes](./agent-responsibility-matrix.md) | Papéis e responsabilidades dos agentes | ✅ Atual |
| [Integração de Ferramentas de Agentes](./agent-tool-integration-guide.md) | Guia de integração de ferramentas | ✅ Atual |
| [Auditoria de Configuração de Agentes](./agent-config-audit.md) | Auditoria de configuração | ✅ Atual |

### Ferramentas e Scripts

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Guia de Integração de Utilitários](./utility-integration-guide.md) | Integração de utilitários | ✅ Atual |
| [Consolidação de Scripts](./analysis/scripts-consolidation-analysis.md) | Análise de scripts | ✅ Atual |
| [Análise de Ferramentas Internas](./internal-tools-analysis.md) | Análise de ferramentas | ✅ Atual |

### Sistema de Squads (anteriormente Squads)

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Estrutura de Squads](./analysis/Squads-structure-inventory.md) | Inventário de estrutura | ⚠️ Atualizar terminologia |
| [Dependências de Squads](./analysis/Squads-dependency-analysis.md) | Análise de dependências | ⚠️ Atualizar terminologia |
| [Validação do Arquiteto](./architect-Squad-rearchitecture.md) | Rearquitetura | ⚠️ Atualizar terminologia |

### Migração e Estratégia

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Plano de Migração de Repositórios](./repository-migration-plan.md) | Plano de execução de migração | ✅ Atual |
| [Análise de Estratégia de Repositórios](./analysis/repository-strategy-analysis.md) | Análise de estratégia | ✅ Atual |
| [Migração de Subdiretórios](./analysis/subdirectory-migration-impact-analysis.md) | Análise de impacto | ✅ Atual |
| [Resolução de Dependências](./dependency-resolution-plan.md) | Resolução de dependências | ✅ Atual |

### Tópicos Especiais

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Rebranding Synkra](./SYNKRA-REBRANDING-SPECIFICATION.md) | Nomenclatura Framework vs Produto | ✅ Atual |
| [Integração CodeRabbit](./coderabbit-integration-decisions.md) | Integração de revisão de código | ✅ Atual |
| [Camada de Memória](./memory-layer.md) | Arquitetura do sistema de memória | ✅ Atual |
| [Hybrid Ops PV Mind](./hybrid-ops-pv-mind-integration.md) | Integração PV Mind | ✅ Atual |

### Documentos de Referência (Oficiais em docs/framework/)

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Stack Tecnológico](../framework/tech-stack.md) | Decisões de tecnologia | ✅ Atual |
| [Padrões de Código](../framework/coding-standards.md) | Padrões de código | ✅ Atual |
| [Árvore de Código-Fonte](../framework/source-tree.md) | Estrutura do projeto | ✅ Atual |

> **Nota:** Estes estão vinculados a `docs/framework/` que é o local oficial. As cópias em `docs/architecture/` estão obsoletas.

### Documentos de Análise (analysis/)

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Análise do Sistema de Ferramentas](./analysis/tools-system-analysis-log.md) | Log de análise | 📦 Candidato a arquivo |
| [Análise de Lacunas do Sistema de Ferramentas](./analysis/tools-system-gap-analysis.md) | Análise de lacunas | 📦 Candidato a arquivo |

### Legado e Arquivados

| Documento | Descrição | Status |
|----------|-------------|--------|
| [Introdução](./introduction.md) | Introdução original (v2.0) | 📦 Candidato a arquivo |
| [Componentes MVP](./mvp-components.md) | Componentes MVP (v2.0) | 📦 Candidato a arquivo |
| [Sistema de Ferramentas Brownfield](./tools-system-brownfield.md) | Análise brownfield | 📦 Candidato a arquivo |
| [Esquema do Sistema de Ferramentas](./tools-system-schema-refinement.md) | Refinamento de esquema | 📦 Candidato a arquivo |
| [Handoff do Sistema de Ferramentas](./tools-system-handoff.md) | Notas de handoff | 📦 Candidato a arquivo |
| [Revisão Técnica Sistema de Saudação](./technical-review-greeting-system-unification.md) | Sistema de saudação | 📦 Candidato a arquivo |
| [Comparação de Esquemas](./schema-comparison-sqlite-supabase.md) | Comparação de esquemas de BD | 📦 Candidato a arquivo |

---

## Diagrama de Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ARQUITETURA AIOS v2.1                               │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    ESTRUTURA MULTI-REPO                          │   │
│   │                                                                  │   │
│   │   SynkraAI/aios-core ◄───── Hub Central                        │   │
│   │          │                    - Core do Framework               │   │
│   │          │                    - 11 agentes base                 │   │
│   │          │                    - Hub de Discussões               │   │
│   │          │                                                       │   │
│   │   ┌──────┴───────┐                                               │   │
│   │   │              │                                               │   │
│   │   ▼              ▼                                               │   │
│   │ aios-squads   mcp-ecosystem                                      │   │
│   │ (MIT)         (Apache 2.0)                                       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    ARQUITETURA MODULAR                           │   │
│   │                                                                  │   │
│   │   .aios-core/                                                    │   │
│   │   ├── core/           ← Fundamentos do Framework                 │   │
│   │   ├── development/    ← Agentes, tarefas, workflows              │   │
│   │   ├── product/        ← Templates, checklists                    │   │
│   │   └── infrastructure/ ← Scripts, ferramentas, integrações        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    QUALITY GATES 3 CAMADAS                       │   │
│   │                                                                  │   │
│   │   Camada 1: Pre-commit ──► Camada 2: PR ──► Camada 3: Humano    │   │
│   │   (Husky/lint-staged)     (CodeRabbit)     (Revisão Estratégica)│   │
│   │        30%                  +50%              +20%               │   │
│   │                        (80% automatizado)                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Ordem de Leitura para Novos Contribuidores

### Início Rápido (30 min)
1. [Arquitetura de Alto Nível](./high-level-architecture.md)
2. [Sistema de Módulos](./module-system.md)
3. [Estratégia Multi-Repo](./multi-repo-strategy.md)

### Aprofundamento (2-3 horas)
1. Todos os documentos do Início Rápido
2. [Matriz de Responsabilidade de Agentes](./agent-responsibility-matrix.md)
3. [Diagramas do Sistema MCP](./mcp-system-diagrams.md)
4. [Integração CodeRabbit](./coderabbit-integration-decisions.md)
5. [Stack Tecnológico](./tech-stack.md)

### Domínio Completo (1-2 dias)
1. Todos os documentos neste índice
2. Padrões relacionados em `.aios-core/docs/standards/`
3. Histórias de implementação em `docs/stories/v2.1/`

---

## Documentação Relacionada

### Padrões (`.aios-core/docs/standards/`)
- [AIOS-LIVRO-DE-OURO-V2.1-COMPLETE.md](../../.aios-core/docs/standards/AIOS-LIVRO-DE-OURO-V2.1-COMPLETE.md)
- [QUALITY-GATES-SPECIFICATION.md](../../.aios-core/docs/standards/QUALITY-GATES-SPECIFICATION.md)
- [STORY-TEMPLATE-V2-SPECIFICATION.md](../../.aios-core/docs/standards/STORY-TEMPLATE-V2-SPECIFICATION.md)

### Histórias
- [Sprint 5 - OSR Stories](../stories/v2.1/sprint-5/)
- [Sprint 6 - Release Stories](../stories/v2.1/sprint-6/)

---

## Legenda de Status dos Documentos

| Status | Significado |
|--------|---------|
| ✅ Atual | Atualizado com v2.1 |
| ⚠️ Atualização necessária | Precisa de atualização de terminologia ou conteúdo |
| 📦 Candidato a arquivo | Deve ser movido para `_archived/` |
| 🆕 Novo | Criado recentemente |

---

**Última Atualização:** 2025-12-14
**Mantenedor:** @architect (Aria)
