# Epic: Central Audiovisual

**ID:** EPIC-AV
**Status:** In Progress
**Date:** 2026-03-19
**Owner:** @pm

## Objetivo

Criar um sistema completo de producao audiovisual automatizada dentro do AIOS. Pipeline end-to-end: ingestao de video bruto ate output de cortes otimizados para redes sociais, com aprovacao humana no meio.

## Principios

1. **CLI First** — Todo pipeline funciona 100% via CLI antes de qualquer UI
2. **Aprovacao humana obrigatoria** — Nenhum video e produzido sem aprovacao
3. **Aprendizado continuo** — Sistema aprende com decisoes do usuario
4. **Separacao analise/execucao** — Pipeline de analise separado do de producao

## Stories

### Phase 1: Foundation
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-1.1 | Squad Structure + Agent Registry | Draft | - |
| AV-1.2 | Database Schema (audiovisual) | Draft | AV-1.1 |

### Phase 2: Ingest & Analysis (CLI)
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-2.1 | Ingest Pipeline CLI — FFprobe + Metadata | Draft | AV-1.2 |
| AV-2.2 | Transcription Engine CLI | Draft | AV-2.1 |
| AV-2.3 | Video Segmentation CLI | Draft | AV-2.2 |

### Phase 3: Intelligence (CLI)
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-3.1 | Smart Cuts — Detection + Suggestion | Draft | AV-2.3 |
| AV-3.2 | Content Description Generator | Draft | AV-2.3 |

### Phase 4: Production Pipeline (CLI)
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-4.1 | Video Assembly CLI | Draft | AV-3.1 |
| AV-4.2 | Smart Subtitles CLI | Draft | AV-4.1 |
| AV-4.3 | Branding Engine CLI | Draft | AV-4.2 |
| AV-4.4 | Quality Validator CLI | Draft | AV-4.3 |

### Phase 5: Scale & Output (CLI)
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-5.1 | Scale System — Variations Generator | Draft | AV-4.4 |
| AV-5.2 | Render Queue Manager CLI | Draft | AV-5.1 |
| AV-5.3 | Output Manager + Drive Upload CLI | Draft | AV-5.2 |

### Phase 6: Approval & Learning (CLI)
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-6.1 | Approval Workflow CLI | Draft | AV-3.1 |
| AV-6.2 | Learning Engine — Pattern Memory | Draft | AV-6.1 |
| AV-6.3 | Playbook System CLI | Draft | AV-6.2 |

### Phase 7: Dashboard UI
| Story | Titulo | Status | Dependencias |
|-------|--------|--------|-------------|
| AV-7.1 | Central Audiovisual Dashboard | Draft | AV-5.3, AV-6.3 |
| AV-7.2 | Approval UI + Preview | Draft | AV-7.1 |
| AV-7.3 | Scale UI + Output Gallery | Draft | AV-7.2 |

## Agentes (16 agentes especializados)

| Agente | ID | Funcao |
|--------|----|--------|
| Maestro Audiovisual | av-maestro | Orquestrar pipeline completo |
| Ingestor de Conteudo | av-ingestor | Entrada de video, criar projeto |
| Leitor Tecnico | av-leitor-tecnico | Analisar metadados (FFprobe) |
| Transcritor | av-transcritor | Gerar texto com timestamps |
| Segmentador | av-segmentador | Dividir video em blocos |
| Identificador de Cortes | av-identificador-cortes | Sugerir cortes inteligentes |
| Curador | av-curador | Organizar aprovacao |
| Montador | av-montador | Montar video final |
| Legenda Inteligente | av-legenda | Gerar legendas otimizadas |
| Branding | av-branding | Aplicar identidade visual |
| Validador | av-validador | Validar qualidade final |
| Render Manager | av-render-manager | Gerenciar fila de render |
| Output Manager | av-output-manager | Organizar arquivos finais |
| Publicador | av-publicador | Upload Drive/plataformas |
| Memory Agent | av-memory | Armazenar padroes aprendidos |
| Playbook Agent | av-playbook | Documentar aprendizados |

## Database Schema: audiovisual

| Tabela | Descricao |
|--------|-----------|
| audiovisual.project | Projetos de producao |
| audiovisual.media_asset | Videos originais e processados |
| audiovisual.cut | Cortes identificados e aprovados |
| audiovisual.approval | Decisoes de aprovacao |
| audiovisual.output | Videos finalizados |
| audiovisual.preset | Configuracoes reutilizaveis |
| audiovisual.learning | Padroes aprendidos |

## Regras do Sistema

1. Sempre exigir aprovacao antes da producao
2. Aprender com decisoes do usuario
3. Padronizar antes de escalar
4. Separar analise de execucao
5. CLI First — pipeline inteiro funciona sem UI
