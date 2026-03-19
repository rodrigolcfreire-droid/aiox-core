# Story AV-7.1: Central Audiovisual Dashboard

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 7 of 7 (Dashboard UI)
**Status:** Done
**Date:** 2026-03-19
**Depends On:** AV-5.3, AV-6.3

## Contexto

Criar dashboard visual da Central Audiovisual integrado ao Health Dashboard existente (React+Vite). 7 abas: Dashboard, Cortes Inteligentes, Escala de Criativos, Biblioteca de Blocos, Playbooks, Output, Relatorios.

## Acceptance Criteria

### Dashboard Page
- [x] Rota /audiovisual no Health Dashboard
- [x] Link no Header com cor roxa
- [x] Stats grid: projetos, processamento, cortes, outputs
- [x] Status bar visual por projeto
- [x] Grid de projetos com click para detalhes

### Tabs (7 abas)
- [x] Dashboard — visao geral
- [x] Cortes Inteligentes — grid de cortes com categoria, score, plataforma, status
- [x] Escala de Criativos — placeholder com instrucao CLI
- [x] Biblioteca de Blocos — grid de blocos segmentados por tipo
- [x] Playbooks — padroes aprendidos e insights
- [x] Output — lista de videos finalizados
- [x] Relatorios — resumo por projeto

### Data Flow (CLI First)
- [x] CLI gera dados: `node bin/av-dashboard-data.js`
- [x] Dashboard consome JSON estatico (read-only)
- [x] Dashboard NUNCA controla ou toma decisoes

## File List

- [x] `bin/av-dashboard-data.js`
- [x] `.aiox-core/scripts/diagnostics/health-dashboard/src/pages/AudiovisualDashboard.jsx`
- [x] `.aiox-core/scripts/diagnostics/health-dashboard/src/pages/AudiovisualDashboard.css`
- [x] `.aiox-core/scripts/diagnostics/health-dashboard/src/App.jsx` (rota adicionada)
- [x] `.aiox-core/scripts/diagnostics/health-dashboard/src/components/shared/Header.jsx` (link adicionado)
