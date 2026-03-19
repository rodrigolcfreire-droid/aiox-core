# Stories AV-8.1 to AV-8.4: Features Faltantes

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 8 (Complementar)
**Status:** Done
**Date:** 2026-03-19

## AV-8.1: Marca/Brand Awareness
- [x] Catalogo de marcas com presets (logo, cores, overlay, estilo)
- [x] CLI para gerenciar marcas
- [x] Associar projeto a marca na ingestao
- [x] Branding automatico por marca

## AV-8.2: Sugestor de Melhorias
- [x] Agente que analisa cortes e sugere ajustes
- [x] Recomendacoes de ritmo, hook, duracao
- [x] Comparacao com padroes aprendidos
- [x] CLI para ver sugestoes

## AV-8.3: Analista de Performance
- [x] Registrar metricas pos-publicacao (views, retencao, shares)
- [x] Correlacionar formato/categoria com resultados
- [x] Ranking de cortes por performance real
- [x] CLI para registrar e consultar metricas

## AV-8.4: Ingestao em Lote (Batch)
- [x] Ingerir multiplos videos de uma vez
- [x] Pipeline paralelo por projeto
- [x] Producao em batch
- [x] CLI batch

## File List
- [x] `packages/audiovisual/lib/brand-catalog.js`
- [x] `packages/audiovisual/lib/suggestions.js`
- [x] `packages/audiovisual/lib/performance.js`
- [x] `packages/audiovisual/lib/batch.js`
- [x] `bin/av-brand.js`
- [x] `bin/av-suggest.js`
- [x] `bin/av-performance.js`
- [x] `bin/av-batch.js`
- [x] `tests/audiovisual/missing-features.test.js`
