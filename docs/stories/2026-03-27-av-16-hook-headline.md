# Story AV-16: Hook Headline Automatico

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 16 (Hook Headlines)
**Status:** Done
**Date:** 2026-03-27

## Descricao

Modulo de gancho automatico que analisa o conteudo do corte e gera uma
headline de abertura nos primeiros 3-5 segundos. Funciona sem LLM usando
heuristicas de transcricao + templates por tipo de hook.

## Acceptance Criteria

- [x] 1. Analisa transcricao e detecta tipo de hook (curiosidade, resultado, emocao, acao, controversia)
- [x] 2. Gera headline curta e chamativa automaticamente
- [x] 3. Usa frase da transcricao quando forte o suficiente, senao template
- [x] 4. Queima headline nos primeiros 0.3-4s do video com animacao (fade + scale)
- [x] 5. Aplica apenas em cortes com score >= 8
- [x] 6. Posicionamento respeita formato (vertical: topo, horizontal: topo)
- [x] 7. Self-healing: 3 estrategias de burn (ass, subtitles, drawtext)
- [x] 8. Integrado no assembly pipeline automaticamente

## Templates por Tipo

| Tipo | Exemplos |
|------|----------|
| curiosidade | "Ninguem te conta isso", "Voce nao vai acreditar" |
| resultado | "{value} na sua conta", "O resultado foi esse" |
| emocao | "Foi aqui que tudo mudou", "Esse momento..." |
| controversia | "Concordam comigo?", "Isso e real?" |
| acao | "Olha isso ate o final", "Fica ate o final" |

## File List

- [x] `packages/audiovisual/lib/hook-headline.js` (modulo completo)
- [x] `packages/audiovisual/lib/assemble.js` (integracao)
