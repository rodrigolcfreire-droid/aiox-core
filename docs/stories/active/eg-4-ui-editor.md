# Story EG-4: UI Editor

**Epic:** Editor Growth (EPIC-EG)
**Status:** InProgress
**Date:** 2026-04-11
**Points:** 8
**Priority:** Medium
**Dependencies:** EG-3 (API REST + Modo Standalone)

## Executor Assignment

executor: "@dev"
quality_gate: "@ux-design-expert"
quality_gate_tools: ["lint", "browser-preview"]

## Story

**As a** expert de conteudo,
**I want** uma interface web de edicao com preview de legendas em tempo real, abas de Timeline e Legendas, galeria de presets e botao de export,
**so that** eu possa refinar meus cortes visualmente sem render intermediarios e com consistencia de estilo.

## Acceptance Criteria

1. `docs/examples/ux-command-center/editor.html` carrega como pagina standalone no Command Center.
2. Player HTML5 `<video>` central com controles de play/pause/seek.
3. Aba "Timeline" permite ajustar trim in/out com inputs numericos e/ou drag handles na barra de progresso.
4. Aba "Legendas" exibe transcricao completa com cada palavra editavel inline (click-to-edit). Edicoes chamam `PUT /api/edit/:editId/transcript` em tempo real.
5. Legendas renderizadas como overlay CSS sobre o `<video>`, sincronizadas via `requestAnimationFrame` lendo `video.currentTime`. ZERO chamadas FFmpeg durante edicao.
6. Galeria de presets exibe miniaturas/previews dos 8 presets disponiveis (carrega via `GET /api/edit/presets`). Click no preset aplica estilo imediatamente no CSS overlay.
7. Botao "Exportar" chama `POST /api/edit/:editId/export` e exibe dialogo de progresso (SSE) com barra de progresso + mensagens de stage.
8. Ao completar export, exibe link de download do .mp4.
9. Estado "vazio" (sem edit carregado) exibe dropzone de upload. Upload dispara fluxo standalone via `POST /api/edit/create` com multipart.
10. Navegacao: lista de edits existentes acessivel via sidebar ou tela inicial (carrega via `GET /api/edit/list`). Click em um edit abre no player.
11. Responsivo: funcional em desktop (1280px+) e tablet landscape (1024px+).
12. Sem frameworks JS (vanilla JS, consistente com outros .html do ux-command-center).

## Tasks / Subtasks

- [x] Criar `docs/examples/ux-command-center/av-editor.html` (AC: 1,12)
  - [x] Estrutura HTML base (player, abas, sidebar)
  - [x] CSS layout (flexbox/grid, responsivo)
  - [x] Sem frameworks (vanilla JS + fetch API)
- [x] Implementar player de video (AC: 2)
  - [x] `<video>` tag com controles nativos
  - [x] Eventos de timeupdate para sincronizacao
- [x] Implementar aba Timeline (AC: 3)
  - [x] Inputs de trim in/out
  - [x] Visual de barra de progresso com marcadores
  - [x] Chamada `PUT /api/edit/:editId/trim` ao alterar
- [x] Implementar aba Legendas (AC: 4,5)
  - [x] Renderizar transcricao como lista de palavras editaveis
  - [x] Click-to-edit inline com save automatico
  - [x] Overlay CSS de legenda sobre o video
  - [x] Sincronizacao via `requestAnimationFrame(video.currentTime)`
- [x] Implementar galeria de presets (AC: 6)
  - [x] Carregar presets via `GET /api/edit/presets`
  - [x] Exibir como cards/miniaturas por expert
  - [x] Click aplica estilo no CSS overlay imediatamente
  - [x] Chamada `PUT /api/edit/:editId/preset` ao selecionar
- [x] Implementar export (AC: 7,8)
  - [x] Botao "Exportar" conecta a `POST /api/edit/:editId/export`
  - [x] Dialogo modal com barra de progresso (leitura de SSE)
  - [x] Link de download ao concluir
- [x] Implementar estado vazio / standalone (AC: 9)
  - [x] Dropzone com drag-and-drop
  - [x] Upload multipart para `POST /api/edit/create`
  - [x] Loading state durante transcricao
  - [x] Abrir editor automaticamente ao concluir
- [x] Implementar lista de edits (AC: 10)
  - [x] Sidebar ou tela inicial com cards de edits existentes
  - [x] Carregar via `GET /api/edit/list`
  - [x] Click abre o edit no player
- [x] Responsividade (AC: 11)
  - [x] Media queries para 1024px+ e 1280px+
  - [x] Testar layout em ambas resolucoes

## Dev Notes

### Codigo existente relevante
- `docs/examples/ux-command-center/index.html` — pagina principal do command center. Verificar navegacao e como linkar o editor.
- `docs/examples/ux-command-center/av-approve.html` — pagina de aprovacao. Bom exemplo de padrao de CSS/JS vanilla usado no command center.
- `docs/examples/ux-command-center/av-live-pipeline.html` — usa SSE para progresso em tempo real. Reutilizar padrao de EventSource.

### Preview CSS de legendas
O ponto mais critico desta story. A legenda e um `<div>` posicionado sobre o `<video>` com CSS absoluto. A cada frame (`requestAnimationFrame`), o JS le `video.currentTime`, encontra a legenda ativa em `subtitles[]`, e atualiza o conteudo + estilo do div. O preset define `fontFamily`, `fontSize`, `fontColor`, `bgColor`, `position`, `animation`, `highlightStyle`. Mapear esses campos para propriedades CSS inline.

### Sem frameworks
O command center usa vanilla JS puro (fetch, EventSource, DOM API). NAO usar React, Vue, ou qualquer framework. Manter consistencia.

### Testing
- Teste manual via browser (abrir `editor.html` diretamente)
- Validar responsividade em 1024px e 1280px
- Validar que ZERO requests a FFmpeg ocorrem durante edicao (monitorar network tab)
- Validar que SSE de export funciona end-to-end

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — no debug issues encountered

### Completion Notes List
- Created av-editor.html as single-file HTML (inline CSS + JS, zero dependencies)
- Player with HTML5 video, custom controls, playback speed
- Subtitle overlay synchronized via requestAnimationFrame reading video.currentTime
- Word-by-word highlight mode renders each word in a span with timed highlighting
- Preset styles mapped to CSS: font, size, color, stroke, background, position, animation
- Pop animation via CSS keyframe scale(0)->scale(1.1)->scale(1)
- Fade animation via CSS keyframe opacity(0)->opacity(1)
- Timeline with draggable trim in/out handles, saves via PUT /api/edit/:editId/trim
- Transcript tab with click-to-seek and click-to-edit (contenteditable with blur save)
- Presets tab with expert filter (Todos/Iris/Caio/Compartilhados) and live mini-preview
- Export via SSE with progress bar, transitions to download button on completion
- Empty state with dropzone (drag-and-drop + file picker), polls for transcript completion
- Existing edits list loaded from GET /api/edit/list
- Added Editor Growth card to index.html audiovisual sector
- Note: story AC says "editor.html" but mission says "av-editor.html" — used av-editor.html to match existing naming convention (av-approve.html, av-live-pipeline.html)

### File List
| File | Action | Description |
|------|--------|-------------|
| `docs/examples/ux-command-center/av-editor.html` | Created | Editor Growth UI — single-file HTML app |
| `docs/examples/ux-command-center/index.html` | Modified | Added Editor Growth card/link in audiovisual sector |
| `docs/stories/active/eg-4-ui-editor.md` | Modified | Updated tasks, status, dev agent record |

## QA Results

**Gate Date:** 2026-05-25
**QA Agent:** @qa (Quinn)
**Verdict:** CONCERNS

### Quality Checks
- [x] Lint — N/A (HTML file, sem ESLint config para HTML inline JS)
- [x] Typecheck — N/A (vanilla JS por design — AC #12)
- [ ] Tests — N/A por design (story explicitamente diz "Teste manual via browser" — sem testes automáticos)
- [x] Coverage — N/A
- [x] File List validation — 3/3 arquivos do File List existem
- [x] AC verification — 12/12 AC mapeáveis ao código (mas não validados em browser real neste gate)
- [x] Security review — UI consome auth-gated API; sem novos perímetros expostos

### File Inventory
- `docs/examples/ux-command-center/av-editor.html` (116411 bytes, 2246 linhas) — single-file HTML+CSS+JS
- `docs/examples/ux-command-center/index.html` — modificado (card adicionado)
- `docs/stories/active/eg-4-ui-editor.md` — atualizado pelo dev

### AC Traceability
| AC | Evidence |
|----|----------|
| 1 | av-editor.html criado (Dev nota: usou `av-editor.html` em vez de `editor.html` para seguir convenção `av-*`) |
| 2-3 | Player HTML5 + Timeline (Tasks marcadas done por @dev) |
| 4-5 | Aba Legendas com click-to-edit + overlay CSS sincronizado via rAF |
| 6 | Galeria de presets carrega de `/api/edit/presets` |
| 7-8 | Botão Exportar via SSE com download link |
| 9 | Empty state com dropzone + upload standalone |
| 10 | Sidebar com lista de edits via `/api/edit/list` |
| 11 | Responsividade 1024px+ / 1280px+ |
| 12 | Vanilla JS confirmado (single-file HTML, sem framework imports) |

### Validation Gaps
Esta story é INTRINSECAMENTE difícil de gatear automaticamente:
- Sem testes E2E (Playwright/Cypress) configurados para o command-center
- Validação manual requer browser session + server rodando + auth válida + edits criados
- Como QA standalone (sem browser handoff), não posso validar: SSE end-to-end, drag-drop UX, responsividade visual, ZERO chamadas FFmpeg durante edição (AC #5)

### Dependência crítica
EG-4 depende de EG-3 funcionar. Como EG-3 está em **CONCERNS** (tests bloqueados por auth-debt), validação end-to-end de EG-4 está duplamente bloqueada.

### Issues Found
- (MEDIUM) Ausência de E2E tests automatizados — aceito por escopo da story (AC #12 + "Teste manual" em Dev Notes), mas gera blind spot para regressões futuras.
- (LOW) AC #1 diz "editor.html" mas implementação usa "av-editor.html" — desvio justificado por consistência de naming (`av-*.html`). Documentado em Completion Notes.
- (BLOCKED) Validação end-to-end depende de EG-3 ter tests verdes.

### Recommendations
- Manter em `active/` até EG-3 fechar (auth-test debt resolvido).
- Bloqueador rastreado em story `docs/stories/active/av-auth-tests-restore.md` (criada 2026-05-25 por @sm) — resolve a dependencia transitiva EG-4 → EG-3 → auth-tests.
- Considerar adicionar smoke test E2E mínimo (Playwright) numa próxima story dedicada a UI testing.
- Antes do próximo merge, fazer pelo menos uma sessão de validação manual documentada (screenshots de cada tab funcionando + um export bem-sucedido).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story criada a partir do PRD Editor Growth | @pm (Morgan) |
| 2026-04-11 | 1.1 | Implementacao completa: av-editor.html + card no index.html | @dev (Dex) |
