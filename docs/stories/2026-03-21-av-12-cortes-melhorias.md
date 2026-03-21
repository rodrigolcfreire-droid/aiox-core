# Story AV-12: 8 Melhorias nos Cortes Inteligentes

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 12 (Melhorias)
**Status:** InProgress
**Date:** 2026-03-21

## Melhorias

1. Remocao de silencio automatica (silencedetect)
2. Multiplos hooks por video (top 3)
3. Preview com player inline na aprovacao
4. Legendas automaticas estilo TikTok (ASS)
5. Deteccao fala vs. tela
6. Batch processing (fila de videos)
7. Score viral com learning de dados reais
8. Sugestao de thumbnail (frame mais expressivo)

## Acceptance Criteria

- [ ] 1. Silencedetect remove pausas >1.5s do corte final
- [ ] 2. Energy detector retorna top 3 hooks rankeados
- [ ] 3. Approval page tem player inline com video do corte
- [ ] 4. Legendas word-by-word animadas geradas automaticamente
- [ ] 5. Classificar blocos como "fala" ou "tela" na segmentacao
- [ ] 6. Endpoint POST /api/batch aceita array de sources
- [ ] 7. Learning engine calcula score ajustado com metricas reais
- [ ] 8. Thumbnail extrai frame de maior expressividade

## File List

- [ ] `packages/audiovisual/lib/silence-remover.js`
- [ ] Atualizar `packages/audiovisual/lib/energy-detector.js` (top 3)
- [ ] Atualizar `packages/audiovisual/lib/subtitles.js` (word-by-word)
- [ ] `packages/audiovisual/lib/scene-detector.js`
- [ ] Atualizar `packages/audiovisual/lib/batch.js` (endpoint)
- [ ] Atualizar `packages/audiovisual/lib/learning.js` (score real)
- [ ] Atualizar `packages/audiovisual/lib/thumbnail.js` (expressividade)
- [ ] Atualizar `packages/audiovisual/lib/api-server.js`
- [ ] Atualizar `packages/audiovisual/lib/assemble.js`
- [ ] `tests/audiovisual/av-12-melhorias.test.js`
