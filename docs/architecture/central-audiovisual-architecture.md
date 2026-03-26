cal# Central Audiovisual — Documento Tecnico Completo

**Data:** 2026-03-19
**Epic:** EPIC-AV
**Status:** Implementado (Phases 1-7 completas)

---

## 1. VISAO GERAL

A Central Audiovisual e um setor autonomo dentro do Centro de Comando UX do AIOS. Opera como dois motores independentes que transformam video bruto em conteudo publicado em escala.

### Posicao no AIOS

```
CENTRO DE COMANDO UX
├── Intelligence (Telegram/WhatsApp) — escuta comunidades
├── Maquina de Briefing — cria estrategia criativa
└── Central Audiovisual — produz conteudo
    ├── Cortes Inteligentes (cerebro criativo)
    └── Escala de Criativos (motor de producao)
```

### Principios

1. **CLI First** — Todo pipeline funciona 100% via terminal
2. **Motores independentes** — Cerebro e Motor operam separados
3. **Aprovacao humana obrigatoria** — Nenhum video produzido sem OK
4. **Aprendizado continuo** — Sistema melhora a cada ciclo
5. **Zero dependencias externas** — Apenas Node.js stdlib + FFmpeg

---

## 2. ARQUITETURA DOS MOTORES

### Motor 1: Cortes Inteligentes (Cerebro Criativo)

**Comando:** `node bin/av-cortes.js`
**Entrada:** Video bruto (local, URL, Google Drive)
**Saida:** Cortes sugeridos e aprovados

```
VIDEO → Ingestao → Transcricao → Segmentacao → Cortes → Descricao
                                                  ↓
                                            [APROVACAO HUMANA]
                                                  ↓
                                            Aprendizado → Playbook
```

**Pipeline (5 etapas):**

| Etapa | Agente | Funcao | Output |
|-------|--------|--------|--------|
| 1. Ingestao | av-ingestor + av-leitor-tecnico | Recebe video, FFprobe | project.json, metadata.json |
| 2. Transcricao | av-transcritor | Whisper API ou import SRT | transcription.json, .srt |
| 3. Segmentacao | av-segmentador | Divide em blocos logicos | segments.json |
| 4. Cortes | av-identificador-cortes | Sugere cortes por categoria | suggested-cuts.json |
| 5. Descricao | av-descritor | Keywords, topicos, titulos | description.json |

**Categorias de corte:** viral, autoridade, educativo, storytelling, cta, bastidores, tendencia

**Plataformas otimizadas:** Instagram Reels, TikTok, YouTube Shorts, Instagram Feed, YouTube

**Aprovacao:**
- `approve <cut-id>` — Aprovar corte individual
- `reject <cut-id>` — Rejeitar com feedback
- `approve-all` — Aprovar todos
- `learn` — Extrair padroes das decisoes
- `playbook` — Gerar documento de boas praticas

### Motor 2: Escala de Criativos (Motor de Producao)

**Comando:** `node bin/av-escala.js`
**Entrada:** Cortes (de qualquer origem)
**Saida:** Videos prontos publicados

```
CORTES APROVADOS → Montagem → Legendas → Branding → Validacao → Output
                                                                   ↓
                                                              Publicacao
```

**Pipeline (6 etapas):**

| Etapa | Agente | Funcao | Output |
|-------|--------|--------|--------|
| 1. Montagem | av-montador | Extrai e rescala via FFmpeg | assembled-*.mp4 |
| 2. Legendas | av-legenda | Burn subtitles (ASS format) | subtitled-*.mp4 |
| 3. Branding | av-branding | Logo watermark, identidade | branded-*.mp4 |
| 4. Validacao | av-validador | Quality check por plataforma | quality-*.json |
| 5. Render | av-render-manager | Fila de renderizacao | final-*.mp4 |
| 6. Output | av-output-manager + av-publicador | Organiza e publica | package.json |

**Estilos de legenda:** minimal, bold, karaoke, subtitle

**Formatos:** 9:16 (vertical), 16:9 (horizontal), 1:1 (quadrado), 4:5 (feed)

**Escala:**
- Gera variacoes Hook + Body + CTA automaticamente
- Multiplica formatos (mesmo corte em 9:16, 16:9, 1:1)
- Render em batch

---

## 3. SQUAD: 16 AGENTES ESPECIALIZADOS

| Agente | ID | Persona | Nucleo |
|--------|----|---------|--------|
| Maestro Audiovisual | av-maestro | Vitor | Orquestracao |
| Ingestor de Conteudo | av-ingestor | Iris | Ingestao |
| Leitor Tecnico | av-leitor-tecnico | Marco | Ingestao |
| Transcritor | av-transcritor | Luna | Ingestao |
| Segmentador | av-segmentador | Theo | Ingestao |
| Identificador de Cortes | av-identificador-cortes | Nina | Criativo |
| Curador | av-curador | Clara | Criativo |
| Montador | av-montador | Rafa | Producao |
| Legenda Inteligente | av-legenda | Sol | Producao |
| Branding | av-branding | Dani | Producao |
| Validador | av-validador | Hugo | Producao |
| Render Manager | av-render-manager | Leo | Producao |
| Output Manager | av-output-manager | Maya | Producao |
| Publicador | av-publicador | Gabi | Producao |
| Memory Agent | av-memory | Nico | Aprendizado |
| Playbook Agent | av-playbook | Tomas | Aprendizado |

---

## 4. BANCO DE DADOS

**Schema:** `audiovisual` (8o schema do Supabase)

| Tabela | Campos-chave | Constraints |
|--------|-------------|-------------|
| `project` | name, source_type, status | 9 estados (created→done) |
| `media_asset` | project_id, type, file_path | 5 tipos (source→final) |
| `cut` | category, start/end_time, engagement_score | duration GENERATED, 7 categorias |
| `approval` | cut_id, decision, feedback | approved/rejected/edited |
| `output` | cut_id, drive_url, quality_score | 5 status |
| `preset` | name+type UNIQUE, config JSONB | branding/legenda/format/quality |
| `learning` | pattern_type, confidence, applied_count | 6 tipos de padrao |

**Infraestrutura:**
- 13 indexes
- 4 triggers updated_at
- RLS em todas as tabelas
- service_role full access
- authenticated read access

---

## 5. ESTRUTURA DE ARQUIVOS

### CLI (bin/)

| Arquivo | Motor | Funcao |
|---------|-------|--------|
| `av-cortes.js` | Cerebro Criativo | Pipeline completo + aprovacao + aprendizado |
| `av-escala.js` | Motor de Producao | Producao + variacoes + output |
| `av-ingest.js` | Cerebro | Ingestao individual |
| `av-transcribe.js` | Cerebro | Transcricao individual |
| `av-segment.js` | Cerebro | Segmentacao individual |
| `av-cuts.js` | Cerebro | Cortes individual |
| `av-describe.js` | Cerebro | Descricao individual |
| `av-produce.js` | Motor | Producao individual |
| `av-scale.js` | Motor | Variacoes individual |
| `av-approve.js` | Cerebro | Aprovacao individual |
| `av-output.js` | Motor | Output individual |
| `av-dashboard-data.js` | Dashboard | Gera dados pro UI |

### Packages (packages/audiovisual/lib/)

| Modulo | Funcao |
|--------|--------|
| `constants.js` | Constantes e configuracoes |
| `project.js` | CRUD de projetos |
| `ffprobe.js` | Wrapper FFprobe |
| `ingest.js` | Ingestao de video |
| `srt-parser.js` | Parse/generate SRT/VTT |
| `transcribe.js` | Transcricao (Whisper API + import) |
| `segment.js` | Segmentacao em blocos |
| `smart-cuts.js` | Deteccao de cortes inteligentes |
| `describe.js` | Descricao de conteudo (NLP) |
| `approval.js` | Workflow de aprovacao |
| `learning.js` | Engine de aprendizado |
| `playbook.js` | Sistema de playbooks |
| `assemble.js` | Montagem de video (FFmpeg) |
| `subtitles.js` | Legendas inteligentes (ASS) |
| `branding.js` | Identidade visual |
| `validate.js` | Validacao de qualidade |
| `scale.js` | Gerador de variacoes |
| `render-queue.js` | Fila de renderizacao |
| `output-manager.js` | Gestao de outputs |

### Squad (squads/central-audiovisual/)

```
squads/central-audiovisual/
├── squad.yaml                              # Config do squad (prefix: av)
├── agents/                                 # 16 agentes
│   ├── av-maestro.md
│   ├── av-ingestor.md
│   ├── av-leitor-tecnico.md
│   ├── av-transcritor.md
│   ├── av-segmentador.md
│   ├── av-identificador-cortes.md
│   ├── av-curador.md
│   ├── av-montador.md
│   ├── av-legenda.md
│   ├── av-branding.md
│   ├── av-validador.md
│   ├── av-render-manager.md
│   ├── av-output-manager.md
│   ├── av-publicador.md
│   ├── av-memory.md
│   └── av-playbook.md
└── workflows/
    └── wf-av-operacao-principal.yaml       # Pipeline 14 fases
```

### Testes (tests/audiovisual/)

| Arquivo | Testes | Cobertura |
|---------|--------|-----------|
| `ingest.test.js` | 18 | Ingestao, projeto, FFprobe, formatos |
| `transcribe.test.js` | 9 | SRT parser, timestamps, import |
| `segment.test.js` | 16 | Classificacao, energia, segmentacao |
| `smart-cuts.test.js` | 16 | Categorias, engagement, plataformas |
| `describe.test.js` | 13 | Keywords, topicos, titulos |
| `production.test.js` | 18 | Assembly, subtitles, branding, validation |
| `scale-output.test.js` | 9 | Variacoes, render queue, output |
| `approval-learning.test.js` | 14 | Aprovacao, learning, playbook |
| **TOTAL** | **113** | **Todos passando** |

### Database (supabase/migrations/)

| Arquivo | Funcao |
|---------|--------|
| `20260319000001_create_audiovisual_schema.sql` | Schema + grants |
| `20260319000002_create_audiovisual_tables.sql` | 7 tabelas + indexes + triggers |
| `20260319000003_create_audiovisual_rls.sql` | RLS + policies |

### Dashboard

| Arquivo | Funcao |
|---------|--------|
| `AudiovisualDashboard.jsx` | Pagina React com 7 abas |
| `AudiovisualDashboard.css` | Estilos dark theme |
| Rota `/audiovisual` no App.jsx | Integrado ao Health Dashboard |

---

## 6. STORIES ENTREGUES

| Story | Phase | Status |
|-------|-------|--------|
| AV-1.1 Squad Foundation | 1 Foundation | Done |
| AV-1.2 Database Schema | 1 Foundation | Done |
| AV-2.1 Ingest Pipeline CLI | 2 Ingest & Analysis | Done |
| AV-2.2 Transcription CLI | 2 Ingest & Analysis | Done |
| AV-2.3 Segmentation CLI | 2 Ingest & Analysis | Done |
| AV-3.1 Smart Cuts CLI | 3 Intelligence | Done |
| AV-3.2 Content Description CLI | 3 Intelligence | Done |
| AV-4.1-4.4 Production Pipeline | 4 Production | Done |
| AV-5.1-5.3 Scale & Output | 5 Scale & Output | Done |
| AV-6.1-6.3 Approval & Learning | 6 Approval & Learning | Done |
| AV-7.1 Dashboard UI | 7 Dashboard | Done |

---

## 7. COMO USAR

### Cerebro Criativo (pensar)

```bash
# Pipeline completo: video → cortes sugeridos
node bin/av-cortes.js /caminho/video.mp4

# Com legenda existente (sem Whisper API)
node bin/av-cortes.js /caminho/video.mp4 --srt legenda.srt

# Ver cortes sugeridos
node bin/av-cortes.js <project-id> status

# Aprovar
node bin/av-cortes.js <project-id> approve cut_001
node bin/av-cortes.js <project-id> approve-all

# Rejeitar com motivo
node bin/av-cortes.js <project-id> reject cut_003 "muito longo"

# Aprender com decisoes
node bin/av-cortes.js <project-id> learn

# Gerar playbook de boas praticas
node bin/av-cortes.js <project-id> playbook
```

### Motor de Producao (executar)

```bash
# Produzir cortes aprovados
node bin/av-escala.js <project-id>

# Produzir corte especifico
node bin/av-escala.js <project-id> --cut cut_001

# Com estilo de legenda diferente
node bin/av-escala.js <project-id> --style bold

# Sem legendas ou sem branding
node bin/av-escala.js <project-id> --no-subs --no-brand

# Gerar variacoes em escala
node bin/av-escala.js <project-id> variacoes

# Ver outputs
node bin/av-escala.js <project-id> output

# Relatorio
node bin/av-escala.js <project-id> report
```

### Dashboard

```bash
# Gerar dados pro dashboard
node bin/av-dashboard-data.js

# Abrir dashboard (Health Dashboard existente, rota /audiovisual)
cd .aiox-core/scripts/diagnostics/health-dashboard && npm run dev
```

---

## 8. PREREQUISITOS

| Dependencia | Como instalar |
|-------------|---------------|
| Node.js 18+ | Ja instalado |
| FFmpeg 8.1 | `brew install ffmpeg` (instalado) |
| OpenAI API Key | `.env` → `OPENAI_API_KEY=sk-...` (para Whisper) |
| Supabase | `npx supabase start` (para DB, opcional) |

---

## 9. NUMEROS

| Metrica | Valor |
|---------|-------|
| Phases entregues | 7/7 |
| Stories completas | 13 |
| Agentes | 16 |
| CLIs | 12 |
| Modulos | 19 |
| Testes | 113 (todos passando) |
| Tabelas DB | 7 |
| Linhas de codigo | ~7.600 |
| Dependencias externas | 0 |
| Commits | 3 |

---

*Central Audiovisual v1.0 — CLI First | Motores Independentes | Aprendizado Continuo*
