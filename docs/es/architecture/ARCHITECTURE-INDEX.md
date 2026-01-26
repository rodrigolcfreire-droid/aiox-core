<!-- Traducción: ES | Original: /docs/en/architecture/ARCHITECTURE-INDEX.md | Sincronización: 2026-01-26 -->

# Índice de Documentación de Arquitectura AIOS

**Versión:** 2.1.1
**Última Actualización:** 2025-12-14
**Estado:** Referencia Oficial

---

## 📋 Navegación de Documentos

Este índice proporciona navegación a toda la documentación de arquitectura para AIOS v2.1.

> **Nota:** La documentación oficial del framework (coding-standards, tech-stack, source-tree) se ha consolidado en `docs/framework/`. Ver [README del Framework](../framework/README.md) para más detalles.

---

## 📁 Estructura de Directorios

```
docs/architecture/
├── ARCHITECTURE-INDEX.md     # Este archivo
├── mcp-system-diagrams.md    # Diagramas de arquitectura MCP
├── mcp-api-keys-management.md # Gestión de claves API
├── high-level-architecture.md # Visión general del sistema
├── module-system.md          # Arquitectura de 4 módulos
├── multi-repo-strategy.md    # Estructura de repositorios
├── decisions/                # Decisiones arquitectónicas (ADRs)
└── [deprecated]              # source-tree.md, coding-standards.md, tech-stack.md
                              # (usar versiones de docs/framework/ en su lugar)
```

> **Análisis Archivado:** Documentos de optimización MCP legados (1MCP) movidos a `.github/deprecated-docs/architecture/analysis/`

---

## 🎯 Enlaces Rápidos por Tema

### Arquitectura Central

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Arquitectura de Alto Nivel](./high-level-architecture.md) | Visión general de arquitectura AIOS v2.1 | ✅ Actual |
| [Sistema de Módulos](./module-system.md) | Arquitectura modular de 4 módulos | ✅ Actual |
| [Estrategia Multi-Repo](./multi-repo-strategy.md) | 3 repos públicos + 2 privados | ✅ Actual |
| [Estrategia Multi-Repo (PT-BR)](./multi-repo-strategy-pt.md) | Versión en portugués | ✅ Actual |

### MCP e Integraciones

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Diagramas del Sistema MCP](./mcp-system-diagrams.md) | Diagramas de arquitectura MCP | ✅ Actual |
| [Gestión de Claves API MCP](./mcp-api-keys-management.md) | Gestión de claves API | ✅ Actual |

> **Nota:** La gestión de MCP se maneja a través del Docker MCP Toolkit (Story 5.11). Usa el agente `@devops` con `*setup-mcp-docker` para configuración. Documentos 1MCP legados archivados en `.github/deprecated-docs/`.

### Sistema de Agentes

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Matriz de Responsabilidades de Agentes](./agent-responsibility-matrix.md) | Roles y responsabilidades de agentes | ✅ Actual |
| [Integración de Herramientas de Agentes](./agent-tool-integration-guide.md) | Guía de integración de herramientas | ✅ Actual |
| [Auditoría de Configuración de Agentes](./agent-config-audit.md) | Auditoría de configuración | ✅ Actual |

### Herramientas y Scripts

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Guía de Integración de Utilidades](./utility-integration-guide.md) | Integración de utilidades | ✅ Actual |
| [Consolidación de Scripts](./analysis/scripts-consolidation-analysis.md) | Análisis de scripts | ✅ Actual |
| [Análisis de Herramientas Internas](./internal-tools-analysis.md) | Análisis de herramientas | ✅ Actual |

### Sistema de Squad (anteriormente Squads)

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Estructura de Squads](./analysis/Squads-structure-inventory.md) | Inventario de estructura | ⚠️ Actualizar terminología |
| [Dependencias de Squads](./analysis/Squads-dependency-analysis.md) | Análisis de dependencias | ⚠️ Actualizar terminología |
| [Validación del Arquitecto](./architect-Squad-rearchitecture.md) | Rearquitectura | ⚠️ Actualizar terminología |

### Migración y Estrategia

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Plan de Migración de Repositorios](./repository-migration-plan.md) | Plan de ejecución de migración | ✅ Actual |
| [Análisis de Estrategia de Repositorios](./analysis/repository-strategy-analysis.md) | Análisis de estrategia | ✅ Actual |
| [Migración de Subdirectorios](./analysis/subdirectory-migration-impact-analysis.md) | Análisis de impacto | ✅ Actual |
| [Resolución de Dependencias](./dependency-resolution-plan.md) | Resolución de dependencias | ✅ Actual |

### Temas Especiales

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Rebranding Synkra](./SYNKRA-REBRANDING-SPECIFICATION.md) | Nomenclatura Framework vs Producto | ✅ Actual |
| [Integración CodeRabbit](./coderabbit-integration-decisions.md) | Integración de revisión de código | ✅ Actual |
| [Capa de Memoria](./memory-layer.md) | Arquitectura del sistema de memoria | ✅ Actual |
| [Hybrid Ops PV Mind](./hybrid-ops-pv-mind-integration.md) | Integración PV Mind | ✅ Actual |

### Documentos de Referencia (Oficiales en docs/framework/)

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Stack Tecnológico](../framework/tech-stack.md) | Decisiones tecnológicas | ✅ Actual |
| [Estándares de Código](../framework/coding-standards.md) | Estándares de código | ✅ Actual |
| [Árbol de Fuentes](../framework/source-tree.md) | Estructura del proyecto | ✅ Actual |

> **Nota:** Estos están enlazados a `docs/framework/` que es la ubicación oficial. Las copias en `docs/architecture/` están deprecadas.

### Documentos de Análisis (analysis/)

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Análisis del Sistema de Herramientas](./analysis/tools-system-analysis-log.md) | Registro de análisis | 📦 Candidato a archivo |
| [Análisis de Brechas del Sistema de Herramientas](./analysis/tools-system-gap-analysis.md) | Análisis de brechas | 📦 Candidato a archivo |

### Legado y Archivado

| Documento | Descripción | Estado |
|----------|-------------|--------|
| [Introducción](./introduction.md) | Introducción original (v2.0) | 📦 Candidato a archivo |
| [Componentes MVP](./mvp-components.md) | Componentes MVP (v2.0) | 📦 Candidato a archivo |
| [Sistema de Herramientas Brownfield](./tools-system-brownfield.md) | Análisis brownfield | 📦 Candidato a archivo |
| [Esquema del Sistema de Herramientas](./tools-system-schema-refinement.md) | Refinamiento de esquema | 📦 Candidato a archivo |
| [Transferencia del Sistema de Herramientas](./tools-system-handoff.md) | Notas de transferencia | 📦 Candidato a archivo |
| [Revisión Técnica Sistema de Saludo](./technical-review-greeting-system-unification.md) | Sistema de saludo | 📦 Candidato a archivo |
| [Comparación de Esquemas](./schema-comparison-sqlite-supabase.md) | Comparación de esquemas BD | 📦 Candidato a archivo |

---

## 🏗️ Diagrama de Visión General de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ARQUITECTURA AIOS v2.1                              │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    ESTRUCTURA MULTI-REPO                         │   │
│   │                                                                  │   │
│   │   SynkraAI/aios-core ◄───── Hub Central                        │   │
│   │          │                    - Núcleo del framework             │   │
│   │          │                    - 11 agentes base                  │   │
│   │          │                    - Hub de discusiones               │   │
│   │          │                                                       │   │
│   │   ┌──────┴───────┐                                               │   │
│   │   │              │                                               │   │
│   │   ▼              ▼                                               │   │
│   │ aios-squads   mcp-ecosystem                                      │   │
│   │ (MIT)         (Apache 2.0)                                       │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    ARQUITECTURA MODULAR                          │   │
│   │                                                                  │   │
│   │   .aios-core/                                                    │   │
│   │   ├── core/           ← Fundamentos del framework                │   │
│   │   ├── development/    ← Agentes, tareas, workflows               │   │
│   │   ├── product/        ← Plantillas, checklists                   │   │
│   │   └── infrastructure/ ← Scripts, herramientas, integraciones     │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    QUALITY GATES 3 CAPAS                         │   │
│   │                                                                  │   │
│   │   Capa 1: Pre-commit ──► Capa 2: PR ──► Capa 3: Humano          │   │
│   │   (Husky/lint-staged)    (CodeRabbit)    (Revisión Estratégica) │   │
│   │        30%                  +50%              +20%               │   │
│   │                        (80% automatizado)                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📚 Orden de Lectura para Nuevos Contribuidores

### Inicio Rápido (30 min)
1. [Arquitectura de Alto Nivel](./high-level-architecture.md)
2. [Sistema de Módulos](./module-system.md)
3. [Estrategia Multi-Repo](./multi-repo-strategy.md)

### Inmersión Profunda (2-3 horas)
1. Todos los documentos de Inicio Rápido
2. [Matriz de Responsabilidades de Agentes](./agent-responsibility-matrix.md)
3. [Diagramas del Sistema MCP](./mcp-system-diagrams.md)
4. [Integración CodeRabbit](./coderabbit-integration-decisions.md)
5. [Stack Tecnológico](./tech-stack.md)

### Dominio Completo (1-2 días)
1. Todos los documentos en este índice
2. Estándares relacionados en `.aios-core/docs/standards/`
3. Stories de implementación en `docs/stories/v2.1/`

---

## 🔗 Documentación Relacionada

### Estándares (`.aios-core/docs/standards/`)
- [AIOS-LIVRO-DE-OURO-V2.1-COMPLETE.md](../../.aios-core/docs/standards/AIOS-LIVRO-DE-OURO-V2.1-COMPLETE.md)
- [QUALITY-GATES-SPECIFICATION.md](../../.aios-core/docs/standards/QUALITY-GATES-SPECIFICATION.md)
- [STORY-TEMPLATE-V2-SPECIFICATION.md](../../.aios-core/docs/standards/STORY-TEMPLATE-V2-SPECIFICATION.md)

### Stories
- [Sprint 5 - Stories OSR](../stories/v2.1/sprint-5/)
- [Sprint 6 - Stories de Release](../stories/v2.1/sprint-6/)

---

## 📝 Leyenda de Estado de Documentos

| Estado | Significado |
|--------|---------|
| ✅ Actual | Actualizado para v2.1 |
| ⚠️ Necesita actualización | Requiere actualización de terminología o contenido |
| 📦 Candidato a archivo | Debe moverse a `_archived/` |
| 🆕 Nuevo | Creado recientemente |

---

**Última Actualización:** 2025-12-14
**Responsable:** @architect (Aria)
