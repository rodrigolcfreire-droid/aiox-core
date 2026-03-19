# Stories AV-4.1 to AV-4.4: Production Pipeline CLI

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 4 of 7 (Production Pipeline)
**Status:** Done
**Date:** 2026-03-19
**Depends On:** AV-3.1

## Stories

### AV-4.1: Video Assembly CLI — Done
- [x] Extrai segmentos do video original via FFmpeg
- [x] Rescala para formato alvo (9:16, 16:9, 1:1, 4:5)
- [x] Concatena blocos em corte final
- [x] Suporte a corte individual ou todos

### AV-4.2: Smart Subtitles CLI — Done
- [x] Gera legendas ASS a partir da transcricao
- [x] 4 estilos: minimal, bold, karaoke, subtitle
- [x] Burns subtitles via FFmpeg ASS filter
- [x] Sincroniza com timestamps do corte

### AV-4.3: Branding Engine CLI — Done
- [x] Carrega preset de branding (logo, posicao, opacidade)
- [x] Aplica watermark via FFmpeg overlay filter
- [x] 4 posicoes de logo (top-left/right, bottom-left/right)
- [x] Salva/carrega presets por projeto

### AV-4.4: Quality Validator CLI — Done
- [x] Valida resolucao, audio, duracao, tamanho
- [x] Checks por plataforma (Reels, TikTok, Shorts, Feed, YouTube)
- [x] Gera quality score (0-10)
- [x] Salva quality report JSON

## File List

- [x] `packages/audiovisual/lib/assemble.js`
- [x] `packages/audiovisual/lib/subtitles.js`
- [x] `packages/audiovisual/lib/branding.js`
- [x] `packages/audiovisual/lib/validate.js`
- [x] `bin/av-produce.js`
- [x] `tests/audiovisual/production.test.js`

## Test Results

- 18/18 production tests passing (90 total)
