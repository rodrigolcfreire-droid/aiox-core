# Story AV-14: Estimativa de Tempo de Processamento

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 14 (UX Feedback)
**Status:** Done
**Date:** 2026-03-26

## Descricao

Exibir previsao de tempo de processamento na tela de upload/analise,
melhorando percepcao de performance e controle da operacao.

## Acceptance Criteria

- [x] 1. Ao selecionar arquivo, exibe estimativa estatica abaixo do nome
- [x] 2. Durante processamento, exibe progresso % + tempo restante atualizado
- [x] 3. Estimativa recalcula dinamicamente conforme progresso real (a cada 3s)
- [x] 4. Mensagens amigaveis por etapa (Preparando, Analisando, Finalizando)
- [x] 5. Estado de fila exibido quando pipeline nao inicia imediatamente

## Formula

```
tempo_estimado (s) = tamanho_arquivo_MB * fator_processamento
```

| Tipo | Fator |
|------|-------|
| Leve | 0.5s/MB |
| Medio | 1.0s/MB |
| Pesado (IA) | 2.0s/MB |

Default: Pesado (pipeline completo com IA).

## Mudancas

### index.html (upload zone)
- Exibir estimativa estatica ao selecionar arquivo
- Formato: "Tempo estimado: ~Xm Ys"
- Mensagem "Preparando seu video..." durante upload

### av-live-pipeline.html (pipeline view)
- Painel de estimativa com barra de progresso + tempo restante
- Mensagens amigaveis por step (6 mensagens contextuais)
- Recalcular a cada 3s baseado em progresso real
- Refina estimativa quando metadata real chega (durationSeconds)
- Auto-completa ao receber waiting_approval

## File List

- [x] `docs/examples/ux-command-center/index.html`
- [x] `docs/examples/ux-command-center/av-live-pipeline.html`
