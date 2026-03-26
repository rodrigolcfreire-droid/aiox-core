# Story AV-15: Legendas Animadas Estilo Reels/TikTok

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 15 (Legendas Pro)
**Status:** Done
**Date:** 2026-03-26

## Descricao

Evoluir o sistema de legendas para gerar legendas animadas word-by-word
com visual profissional estilo conteudo viral (Reels/TikTok/Shorts).

## Etapas

1. Transcricao com timestamps por palavra (Whisper word-level)
2. Inteligencia: blocos curtos + deteccao de palavras-chave
3. Presets visuais com animacao ASS
4. Render no video final via FFmpeg

## Acceptance Criteria

- [x] 1. Whisper retorna timestamps por palavra (word granularity)
- [x] 2. Modulo identifica palavras-chave para destaque (verbos de acao, numeros, nomes)
- [x] 3. 4 presets visuais: viral, clean, impacto, premium
- [x] 4. Animacao de entrada por palavra (fade-in ou scale-up via ASS)
- [x] 5. Palavra-chave com cor diferente (highlight automatico)
- [x] 6. Blocos curtos de 2-4 palavras (nao frase inteira)
- [x] 7. Posicionamento respeita formato (vertical: centro-baixo, horizontal: bottom)
- [x] 8. Fonte forte com outline/sombra legivel em mobile

## Presets

| Preset | Fonte | Animacao | Highlight |
|--------|-------|----------|-----------|
| viral | Arial Black | scale 80->100% + fade | amarelo, scale 90->110->100% |
| clean | Helvetica Neue | fade 150ms | azul |
| impacto | Impact | slam 130->100% | vermelho-laranja, slam 150->105% |
| premium | Georgia | fade suave 200ms | dourado |

## File List

- [x] `packages/audiovisual/lib/transcribe.js` (word timestamps)
- [x] `packages/audiovisual/lib/subtitles.js` (presets + animacao)
