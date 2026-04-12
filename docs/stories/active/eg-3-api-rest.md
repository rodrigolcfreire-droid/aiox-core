# Story EG-3: API REST + Modo Standalone

**Epic:** Editor Growth (EPIC-EG)
**Status:** InProgress
**Date:** 2026-04-11
**Points:** 5
**Priority:** High
**Dependencies:** EG-2 (Presets + Export Engine)

## Executor Assignment

executor: "@dev"
quality_gate: "@architect"
quality_gate_tools: ["lint", "typecheck", "tests"]

## Story

**As a** editor operacional,
**I want** uma API REST para gerenciar edits e exportar via HTTP, incluindo upload direto de video para modo standalone,
**so that** a futura UI e qualquer integracao possam operar o editor sem depender do CLI.

## Acceptance Criteria

1. Rotas adicionadas em `api-server.js` sob prefixo `/api/edit/`:
   - `POST /api/edit/create` — cria edit (body: `{ source, projectId? }`)
   - `GET /api/edit/list` — lista edits
   - `GET /api/edit/:editId` — retorna edit completo
   - `PUT /api/edit/:editId/trim` — atualiza trim (body: `{ in, out }`)
   - `PUT /api/edit/:editId/transcript` — edita transcricao (body: `{ index, text }`)
   - `PUT /api/edit/:editId/preset` — aplica preset (body: `{ presetId }`)
   - `POST /api/edit/:editId/export` — inicia export, retorna SSE stream com progresso
   - `DELETE /api/edit/:editId` — deleta edit
2. `POST /api/edit/create` com source = path de video e sem projectId ativa modo standalone: upload do arquivo + `transcribe.js` automatico.
3. O endpoint de upload aceita `multipart/form-data` com campo `video` para standalone.
4. `POST /api/edit/:editId/export` retorna `Content-Type: text/event-stream` com eventos `{ stage, progress, message }` durante o export.
5. Ao concluir export, ultimo evento SSE contem `{ stage: 'done', outputPath }`.
6. `GET /api/edit/presets` retorna lista de presets disponiveis (usa `subtitle-presets.js`).
7. `GET /api/edit/presets/:expert` retorna presets de um expert especifico.
8. Rotas NAO alteram nenhuma rota existente do `api-server.js` (extend-only, CON6).
9. Erros retornam JSON `{ error, message }` com HTTP status codes corretos (400, 404, 500).
10. Testes de integracao em `tests/audiovisual/edit-api.test.js` cobrem: create (ambos modos), CRUD completo, export com SSE, error handling (editId inexistente, preset invalido).

## Tasks / Subtasks

- [x] Adicionar rotas `/api/edit/*` em `api-server.js` (AC: 1,8)
  - [x] `POST /api/edit/create` — delega para `edit-store.createEdit()`
  - [x] `GET /api/edit/list` — delega para `edit-store.listEdits()`
  - [x] `GET /api/edit/:editId` — delega para `edit-store.getEdit()`
  - [x] `PUT /api/edit/:editId/trim` — valida body + delega para `edit-store.updateEdit()`
  - [x] `PUT /api/edit/:editId/transcript` — valida body + delega para transcript-edit logic
  - [x] `PUT /api/edit/:editId/preset` — valida preset existe + aplica
  - [x] `DELETE /api/edit/:editId` — delega para `edit-store.deleteEdit()`
- [x] Implementar upload multipart para standalone (AC: 2,3)
  - [x] Aceitar `multipart/form-data` com campo `video`
  - [x] Salvar em `data/av/uploads/` + chamar `transcribe.js`
  - [x] Retornar editId criado
- [x] Implementar export com SSE (AC: 4,5)
  - [x] `POST /api/edit/:editId/export` — inicia export via `edit-export.exportEdit()`
  - [x] Stream de eventos SSE: `{ stage, progress, message }`
  - [x] Evento final: `{ stage: 'done', outputPath }`
- [x] Adicionar rotas de presets (AC: 6,7)
  - [x] `GET /api/edit/presets` — lista todos
  - [x] `GET /api/edit/presets/:expert` — filtra por expert
- [x] Error handling padronizado (AC: 9)
  - [x] Middleware de erro para rotas `/api/edit/*`
  - [x] Retornar `{ error, message }` com status corretos
- [x] Criar `tests/audiovisual/edit-api.test.js` (AC: 10)
  - [x] Teste create (modo cut e standalone)
  - [x] Teste CRUD completo (create -> trim -> transcript -> preset -> show -> delete)
  - [x] Teste export com verificacao de eventos SSE
  - [x] Teste error handling (404, 400, 500)
  - [x] Teste upload multipart
- [x] Lint + typecheck verdes

## Dev Notes

### Codigo existente relevante
- `packages/audiovisual/lib/api-server.js` (978 linhas) — ja usa HTTP raw (sem express) + SSE para outros endpoints. Seguir o mesmo padrao de criacao de rotas e SSE que ja existe no arquivo.
- Pattern de SSE existente: buscar `text/event-stream` em `api-server.js` para replicar o padrao.
- Upload: o `api-server.js` ja pode ter logica de upload via `drive-upload.js`. Verificar se ha padrao reutilizavel.

### Nota sobre extend-only
A CON6 do PRD exige que nenhuma assinatura publica existente seja alterada. Adicionar rotas no final do arquivo ou em bloco isolado, sem modificar handlers existentes.

### Testing
- `tests/audiovisual/edit-api.test.js`
- Usar request HTTP real contra o server (ou mock leve do handler)
- Para SSE: ler eventos do stream e validar sequencia
- Framework: Jest

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- All 26 tests passing, 0 failures
- Full suite: 322 suites passed, 8025 tests passed, 0 regressions
- Lint: test file clean; api-server warnings are all pre-existing

### Completion Notes List
- 11 REST routes added to api-server.js under `/api/edit/*` prefix (extend-only, no existing routes modified)
- Standalone mode: JSON body with video path OR multipart upload, auto-transcription in background
- Export route uses SSE (text/event-stream) with progress events, matching existing pipeline SSE pattern
- Preset validation separated from edit-not-found to return proper 400 vs 404
- Multipart parsing is minimal (no external deps) -- suitable for small files; large files should use chunked upload

### File List
| File | Status | Description |
|------|--------|-------------|
| `packages/audiovisual/lib/api-server.js` | Modified | Added 11 edit routes + imports for edit-store, subtitle-presets, edit-export |
| `tests/audiovisual/edit-api.test.js` | Created | 26 tests covering CRUD, presets, SSE export, error handling |
| `docs/stories/active/eg-3-api-rest.md` | Modified | Story progress updates |

## QA Results
_A ser preenchido pelo QA agent_

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story criada a partir do PRD Editor Growth | @pm (Morgan) |
| 2026-04-12 | 1.1 | Implementation complete: 11 routes + 26 tests | @dev (Dex) |
