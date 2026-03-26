# Story AV-12: 8 Melhorias nos Cortes Inteligentes

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 12 (Melhorias)
**Status:** Done
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

## Refinamentos Adicionais (AV-12b)

9. Integracao silence removal no assembly pipeline
10. Integracao scene detection na segmentacao (enriquece blocos)
11. Cut boundaries inteligentes — snap para fim de frase/pausa natural
12. Engagement score multi-fator (8 dimensoes: energy, category, duration, hook, speech pace, scene variety, position, density)
13. Combinacao de blocos com arco narrativo (hook → content → climax)
14. Deduplicacao por overlap (>50% = duplicata, mantém melhor score)
15. Categoria com peso posicional (keywords no inicio valem 2x)
16. Fade in/out suave nas transicoes (0.5s in, 0.8s out)

## Acceptance Criteria

- [x] 1. Silencedetect remove pausas >1.5s do corte final
- [x] 2. Energy detector retorna top 3 hooks rankeados
- [x] 3. Approval page tem player inline com video do corte
- [x] 4. Legendas word-by-word animadas geradas automaticamente
- [x] 5. Classificar blocos como "fala" ou "tela" na segmentacao
- [x] 6. Endpoint POST /api/batch aceita array de sources
- [x] 7. Learning engine calcula score ajustado com metricas reais
- [x] 8. Thumbnail extrai frame de maior expressividade
- [x] 9. Silence removal integrado no assembly (remove ar morto antes de montar)
- [x] 10. Scene detection enriquece blocos com sceneType e sceneChangeRate
- [x] 11. Cortes alinham start/end com pausas naturais da transcricao
- [x] 12. Score usa 8 fatores: energy, category, duration, hook, speech pace, scene variety, position, density
- [x] 13. Strategy narrative-arc combina 3 blocos (abertura → dev → climax)
- [x] 14. Deduplicacao overlap-based (>50% = duplicate, keeps best)
- [x] 15. Categoria usa peso posicional (hook zone 2x)
- [x] 16. Fade in/out automatico no assembled final

## File List

- [x] `packages/audiovisual/lib/silence-remover.js`
- [x] `packages/audiovisual/lib/energy-detector.js` (top 3)
- [x] `packages/audiovisual/lib/subtitles.js` (word-by-word)
- [x] `packages/audiovisual/lib/scene-detector.js`
- [x] `packages/audiovisual/lib/batch.js` (endpoint)
- [x] `packages/audiovisual/lib/learning.js` (score real)
- [x] `packages/audiovisual/lib/thumbnail.js` (expressividade)
- [x] `packages/audiovisual/lib/smart-cuts.js` (cut boundaries, multi-factor score, narrative arc, overlap dedup, positional category)
- [x] `packages/audiovisual/lib/segment.js` (scene detection integration)
- [x] `packages/audiovisual/lib/assemble.js` (silence removal + fade transitions)
- [x] `tests/audiovisual/smart-cuts.test.js` (27 tests)
- [x] `tests/audiovisual/av-12-melhorias.test.js` (17 tests)
