# Stories AV-9: Integrations

**Epic:** Central Audiovisual (EPIC-AV)
**Phase:** 9 (Integrations)
**Status:** In Progress
**Date:** 2026-03-19

## AV-9.1: API HTTP Server
- [ ] Server HTTP nativo Node.js com router
- [ ] Endpoints REST para todos os pipelines
- [ ] CORS habilitado para dashboard
- [ ] CLI: node bin/av-server.js

## AV-9.2: Thumbnails
- [ ] Extrair frame do video via FFmpeg
- [ ] Gerar thumbnail por corte
- [ ] CLI: node bin/av-thumbnail.js

## AV-9.3: Supabase Client
- [ ] Wrapper para conectar modulos ao banco
- [ ] Sync projeto/cortes/aprovacoes com DB

## AV-9.4: Google Drive Upload
- [ ] Upload via Drive API (OAuth2)
- [ ] Criar pastas automaticamente
- [ ] Gerar links de compartilhamento

## AV-9.5: Webhooks
- [ ] Sistema de eventos internos
- [ ] Notificar outros setores do AIOS
