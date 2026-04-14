# PRD: Editor Growth

**Module:** `packages/audiovisual` (Editor Growth submodule)
**Owner:** @pm (Morgan)
**Status:** Draft
**Created:** 2026-04-11
**Version:** 1.0
**Related Epic:** EPIC-EG (Editor Growth)
**Parent Epic:** EPIC-AV (Central Audiovisual)

---

## 1. Goals

- Fornecer uma camada de refinamento manual entre Cortes Inteligentes e export final, eliminando inconsistencia visual e erros de legenda que hoje chegam ao render.
- Permitir correcao palavra-a-palavra da transcricao do Whisper antes do burn de legenda.
- Habilitar um sistema de presets visuais manuais por expert (Iris, Caio, futuros), sem automacao magica.
- Oferecer modo standalone onde qualquer video pode ser enviado, transcrito e editado sem depender do fluxo de cortes existente.
- Manter edicao 100% nao-destrutiva: cada edit e um JSON declarativo; o corte/video original nunca e sobrescrito.
- Entregar feature flagship 100% via CLI antes de qualquer UI (Article I — CLI First).

## 2. Background Context

Hoje o pipeline do AV gera cortes via `smart-cuts.js`, passa pelo assembly (`assemble.js`), queima legenda (`subtitles.js`) e vai direto ao export. Nao existe camada de preview nem correcao de transcricao. O resultado: (1) erros de Whisper vao ao ar, (2) estilos visuais variam por tentativa-e-erro, (3) expert nao consegue padronizar visual por canal/persona, (4) retrabalho manual em ferramenta externa quebra a promessa de CLI First.

O Editor Growth fecha esse gap entregando edicao declarativa (JSON), preview CSS sem re-render, presets manuais por expert e um unico render FFmpeg no export final. Todas as capacidades ja existem fragmentadas em `subtitles.js`, `smart-cuts.js`, `assemble.js` e `transcribe.js` — o Editor Growth orquestra e da uma interface coerente em volta delas.

## 3. Change Log

| Data | Versao | Descricao | Autor |
|------|--------|-----------|-------|
| 2026-04-11 | 1.0 | PRD inicial criado a partir de brief validado pelo Rodrigo | @pm (Morgan) |

## 4. Personas

| Persona | Descricao | Uso primario |
|---------|-----------|-------------|
| Expert de conteudo (Iris, Caio) | Dono de canal/persona, quer consistencia visual e precisao de legenda | Revisao rapida de cortes aprovados + aplicacao de preset proprio |
| Editor operacional | Faz refinamentos finais antes do export | Modo standalone: upload direto de qualquer video |
| Rodrigo (owner) | Gestor do pipeline, valida qualidade final | Inspeciona e exporta cortes ajustados |

## 5. User Journeys

### J1 — Refinamento de corte aprovado

```
Corte aprovado em Smart Cuts
  -> editor abre vídeo limpo (sem legenda, sem estilo)
  -> aba Timeline: ajusta trim in/out
  -> aba Legendas: corrige palavra errada do Whisper
  -> escolhe preset "iris-forte"
  -> preview CSS em tempo real (zero render)
  -> clica Exportar
  -> 1 render FFmpeg unico aplica trim + legenda + preset
  -> download .mp4
```

### J2 — Modo standalone

```
Usuario abre editor sem projeto
  -> arrasta video.mp4
  -> sistema chama transcribe.js (Whisper)
  -> vídeo abre limpo no editor
  -> mesmo fluxo de J1 a partir da aba Timeline
```

## 6. Requirements

### 6.1 Functional (FR)

- **FR1:** O sistema DEVE armazenar cada edicao como objeto JSON declarativo (`edit-store.js`) contendo `editId`, `projectId`, `sourceVideo`, `trim`, `transcript[]`, `subtitles[]`, `presetId`, `status`.
- **FR2:** O sistema NUNCA pode sobrescrever o arquivo de cut original. Todas as transformacoes sao aplicadas apenas no export final.
- **FR3:** O CLI `bin/av-edit.js` DEVE expor os comandos: `create`, `trim`, `transcript-edit`, `apply-preset`, `export`, `list`, `show`.
- **FR4:** `av-edit create` DEVE aceitar ou um `cutId` (continuacao de fluxo) ou um path de video (modo standalone). No modo standalone, DEVE disparar `transcribe.js` automaticamente e popular `transcript[]`.
- **FR5:** `av-edit trim --in X --out Y` DEVE atualizar apenas o campo `trim` do edit, sem tocar no video fonte.
- **FR6:** `av-edit transcript-edit` DEVE permitir corrigir qualquer item de `transcript[]` marcando `edited: true`, preservando o timestamp original.
- **FR7:** O sistema DEVE prover uma biblioteca de presets em `data/av/presets/{expert}/*.json`. Presets iniciais obrigatorios: Iris Default, Iris Clean, Iris Forte, Caio Pop, Caio Bold, Karaoke, Beasty, Minimal.
- **FR8:** Presets DEVEM ser aplicados manualmente pelo expert. NAO HAVERA selecao automatica de preset por conteudo, canal ou campanha.
- **FR9:** O export (`av-edit export`) DEVE produzir um unico render FFmpeg que aplique trim + legenda editada + preset em uma passagem, reutilizando `subtitles.js`, `smart-cuts.js` e `assemble.js`.
- **FR10:** O export DEVE resultar em um arquivo `.mp4` no diretorio `data/av/exports/` e NAO DEVE enviar o arquivo para nenhum outro modulo (sem "Send to Scale", sem publicacao).
- **FR11:** A API REST em `api-server.js` DEVE expor `/api/edit/*` com CRUD de edits e endpoint de export com progresso via SSE.
- **FR12:** O editor Web (`editor.html`) DEVE carregar o video via tag HTML5 `<video>` e renderizar legendas como overlay CSS sincronizado via `requestAnimationFrame(video.currentTime)`. ZERO chamadas de FFmpeg durante edicao.
- **FR13:** O editor Web DEVE ter abas Timeline e Legendas, editor de transcricao inline, galeria de presets visivel, e botao de export.
- **FR14:** O editor Web DEVE expor estado "vazio" que aceita upload direto, disparando fluxo standalone.
- **FR15:** O sistema DEVE permitir listar e retomar edits em draft (`status: draft`) e marca-los como `exported` apos export bem-sucedido.

### 6.2 Non-Functional (NFR)

- **NFR1:** Toda funcionalidade deve estar 100% operacional via CLI (`bin/av-edit.js`) antes do merge da UI (Article I — CLI First).
- **NFR2:** Preview de legendas na UI NAO pode acionar FFmpeg. Custo computacional de editar = zero renders.
- **NFR3:** Export final deve completar em tempo comparavel ao render atual de `assemble.js` para corte equivalente (baseline: mesma duracao do corte +/- 10%).
- **NFR4:** Todos os novos modulos devem usar absolute imports (Article VI).
- **NFR5:** Cobertura de testes: cada arquivo novo deve ter arquivo de teste correspondente em `tests/audiovisual/edit-*.test.js` com AC principais cobertas.
- **NFR6:** Quality gates obrigatorios antes de push: `npm run lint`, `npm run typecheck`, `npm test` verdes.
- **NFR7:** Edits persistidos devem sobreviver a restart do api-server (armazenamento em disco, nao em memoria).
- **NFR8:** Sem dependencias externas novas. Pode reutilizar apenas o que `packages/audiovisual` ja tem instalado (FFmpeg, Whisper, node core).
- **NFR9:** Compatibilidade: nao pode quebrar nenhuma rota/comando existente do pipeline AV (ingest, transcribe, smart-cuts, assemble, subtitles).

### 6.3 Constraints (CON)

- **CON1:** Edicao deve ser nao-destrutiva. JSON declarativo e a unica fonte da verdade; arquivo fonte e imutavel.
- **CON2:** Sem feature "Send to Scale". O fluxo termina em .mp4 local. Qualquer integracao posterior esta fora de escopo.
- **CON3:** Presets sao manuais por expert. NAO HA conceito de "campanha", "auto-sugestao", "IA de estilo" neste escopo.
- **CON4:** Modo standalone e OBRIGATORIO. O editor nao pode depender do fluxo de cortes para funcionar.
- **CON5:** Reuso obrigatorio: `subtitles.js`, `smart-cuts.js`, `assemble.js`, `transcribe.js`, `api-server.js` devem ser reaproveitados. Nada de reescrever funcionalidade ja existente.
- **CON6:** Modulo deve ficar isolado em `packages/audiovisual/lib/edit-*` e nao pode alterar assinaturas publicas dos modulos existentes acima de CON5 (extend-only).

## 7. UX Goals (High Level)

- **Acessibilidade:** WCAG AA (consistente com dashboards existentes do command center).
- **Plataforma:** Web Responsive (parte de `docs/examples/ux-command-center/`).
- **Visao UX:** Editor "limpo" — o video sempre entra sem legenda e sem estilo; expert liga o que quer. Preview instantaneo, sem loading, sem render. "O que voce ve e o que o export vai gerar."
- **Paradigma de interacao:** Abas (Timeline / Legendas), inline edit de transcricao (click-to-edit na palavra), galeria de presets em miniatura, botao Exportar unico.
- **Core screens:**
  - Editor principal (`editor.html`) com player + abas
  - Estado vazio com dropzone de upload (standalone)
  - Galeria de presets por expert
  - Dialogo de progresso de export (SSE)

## 8. Success Criteria

- [ ] CLI `bin/av-edit.js` executa fluxo completo (create -> trim -> transcript-edit -> apply-preset -> export) para video standalone e para cortes aprovados.
- [ ] Edicao nao-destrutiva validada: apos 10 edits consecutivos, arquivo fonte permanece byte-identico.
- [ ] Export produz `.mp4` valido em menos de 110% do tempo de assemble equivalente.
- [ ] UI editor.html suporta preview de legendas sincronizadas com o video sem nenhum render FFmpeg.
- [ ] Modo standalone: upload de video.mp4 + transcricao automatica + export funciona sem projeto pre-existente.
- [ ] 8 presets iniciais (Iris x3, Caio x2, Karaoke, Beasty, Minimal) entregues, documentados e aplicaveis via CLI e UI.
- [ ] Zero regressao em testes existentes de `packages/audiovisual`.

## 9. Scope

### In Scope
- `edit-store.js`, `subtitle-presets.js`, `edit-export.js`
- `bin/av-edit.js` (CLI)
- `data/av/presets/{iris,caio,generic}/*.json`
- Rotas `/api/edit/*` em `api-server.js` (CRUD + export SSE)
- `docs/examples/ux-command-center/editor.html` (UI)
- Testes em `tests/audiovisual/edit-*.test.js`

### Out of Scope
- Integracao com Scale / Drive / canais (sem publicacao automatica)
- Auto-sugestao de preset por conteudo / IA de estilo
- Edicao multi-track ou multi-video (single clip por edit)
- Colaboracao em tempo real entre usuarios
- Desfazer/refazer multi-nivel alem do que o proprio JSON declarativo permite
- Versionamento de presets (v1 apenas arquivos estaticos)
- Suporte a formatos diferentes de mp4 no export

## 10. Complexity Assessment

| Dimensao | Score | Justificativa |
|----------|-------|---------------|
| Scope | 3/5 | ~7 arquivos novos + modificacoes em api-server |
| Integration | 2/5 | So FFmpeg, sem APIs externas |
| Infrastructure | 1/5 | Mesmo servidor/storage do AV |
| Knowledge | 3/5 | CSS sync com video tem poucas refs |
| Risk | 1/5 | Isolado, nao toca pipeline atual |
| **Total** | **10/25** | **STANDARD** — 4 stories sequenciais |

## 11. Risks

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| CSS sync com video fora de sincronia em dispositivos lentos | Medio | Usar `requestAnimationFrame`, testar em baseline de hardware |
| Export divergindo do preview (legendas deslocadas) | Alto | Regra unica: CSS preview usa mesmos offsets do `subtitles.js` |
| Incompatibilidade com estado atual de cuts aprovados | Medio | Reutilizar api interna de cuts sem alterar; CON6 garante extend-only |
| Presets por expert crescendo e virando bagunca | Baixo | Estrutura `data/av/presets/{expert}/` + schema validado em `subtitle-presets.js` |
| Modo standalone mascarando bugs do pipeline de cortes | Baixo | Testes separados para os dois modos |

## 12. Dependencies

**Reutiliza (sem modificar interface publica):**
- `packages/audiovisual/lib/subtitles.js`
- `packages/audiovisual/lib/smart-cuts.js`
- `packages/audiovisual/lib/assemble.js`
- `packages/audiovisual/lib/transcribe.js`
- `packages/audiovisual/lib/api-server.js` (adiciona rotas)

**Bloqueia:** nada (feature isolada)
**Bloqueado por:** pipeline AV atual deve estar estavel (esta).

## 13. Open Questions / Gaps

Nenhum bloqueio identificado. Observacoes para futuras iteracoes:
1. Schema de preset ainda nao formalizado — sera definido na EG-2 com base no que `subtitles.js` ja aceita.
2. Estrategia de persistencia do edit store (filesystem JSON vs sqlite) sera decidida na EG-1 — default: filesystem JSON por simplicidade e consistencia com outros modulos AV.
3. Limpeza de edits antigos / policy de retencao: fora de escopo v1, tracker para v1.1.

---

**Proximo passo:** criar `docs/epics/epic-editor-growth.md` e 4 stories em `docs/stories/active/` (EG-1 -> EG-4).
