# Story AV-10: Hook de Energia + Regra de Duração

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 10 (Hook Intelligence)
**Status:** Draft — Implementar na próxima sessão
**Date:** 2026-03-20

## Contexto

Regra de produção: todo corte produzido deve ter um hook de 5 segundos no início, extraído do momento de maior energia/alegria do vídeo. Duração dos cortes: 90s (1:30) e alguns com 120s (2:00).

## Regras

1. **Detectar pico de energia** — encontrar o momento de mais alegria/animação no vídeo
   - Analisar volume do áudio (picos de amplitude)
   - Analisar velocidade de fala (words per second)
   - Detectar risos, exclamações, reações fortes
2. **Extrair 5s do pico** como HOOK
3. **Montar: HOOK (5s) + CORTE ORIGINAL**
4. **Duração:** 90s (padrão) e 120s (variação longa)
5. Aplicar automaticamente no Motor de Produção

## Acceptance Criteria

- [ ] Detectar momento de maior energia por análise de áudio (FFmpeg loudnorm/volumedetect)
- [ ] Extrair 5s desse momento como clip separado
- [ ] Concatenar HOOK + CORTE no assembly
- [ ] Duração total: 90s ou 120s (configurável)
- [ ] Ajustar smart-cuts para gerar cortes nessas durações
- [ ] Preview do hook na página de aprovação

## Technical Notes

- FFmpeg `volumedetect` pra encontrar picos de volume
- `silencedetect` invertido pra encontrar momentos mais barulhentos
- Dividir áudio em janelas de 5s e calcular RMS de cada
- O pico de RMS = momento de maior energia
- Concatenar via `ffmpeg -f concat`

## File List

- [ ] `packages/audiovisual/lib/energy-detector.js`
- [ ] Atualizar `packages/audiovisual/lib/assemble.js` com hook automático
- [ ] Atualizar `packages/audiovisual/lib/smart-cuts.js` com durações 90s/120s
- [ ] `tests/audiovisual/energy-detector.test.js`
