# Story AV-11: LLM Intelligence — Hook Detection + Title Generation

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 11 (LLM Intelligence)
**Status:** InProgress
**Date:** 2026-03-21

## Contexto

Integrar LLM (Claude) na pipeline de cortes inteligentes para:
1. Detectar hooks semanticamente (analisar transcrição, não só volume)
2. Gerar títulos virais e descrições otimizadas por plataforma

## Acceptance Criteria

- [ ] Módulo LLM client (llm-client.js) que chama Claude API via HTTPS nativo
- [ ] Análise semântica da transcrição para identificar melhores hooks
- [ ] Geração de títulos virais por corte
- [ ] Integração na pipeline (após transcrição)
- [ ] Fallback graceful se API key não configurada (usa heurística atual)
- [ ] Testes

## File List

- [ ] `packages/audiovisual/lib/llm-client.js`
- [ ] `packages/audiovisual/lib/llm-hooks.js`
- [ ] Atualizar `packages/audiovisual/lib/smart-cuts.js`
- [ ] Atualizar `packages/audiovisual/lib/describe.js`
- [ ] Atualizar `packages/audiovisual/lib/live-pipeline.js`
- [ ] `tests/audiovisual/llm-hooks.test.js`
