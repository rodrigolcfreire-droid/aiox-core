# TECH-DEBT: Restaurar tests audiovisual pós-fechamento de auth

**Status:** Open
**Priority:** MEDIUM
**Created:** 2026-04-21 by @devops (Gage)
**Origin commit:** `1e2d8ef7 fix(av-server): fechar perimetro de auth e carregar .env`

## Contexto

Em `1e2d8ef7` o perimetro de auth do `av-server` foi fechado — todo endpoint `/api/*` passou a exigir cookie/Bearer/`?token=`. Os tests de integração em `tests/audiovisual/` **não foram atualizados** pra mockar auth e agora falham com `Authentication required`.

Essa violação bloqueia a Constitution art. V (Quality First — `MUST: npm test passa sem falhas`) desde então. Todos os pushes posteriores foram feitos com tech debt acknowledged. Registrado agora pra destrava futuro.

## Estado atual

```
Test Suites: 3 failed, 13 skipped, 319 passed, 322 of 335 total
Tests:       31 failed, 172 skipped, 7994 passed, 8197 total
```

**Suites quebradas (todas em `tests/audiovisual/`):**
- `integrations.test.js` — API Server endpoints sem mock de auth
- (outras 2 — identificar via `npm test 2>&1 | grep "FAIL tests"`)

**Padrão de erro:** testes chamam `handleRequest(req, res)` direto com `req` sem headers de auth; `checkAuth` retorna false antes da rota ser executada.

## Acceptance Criteria

1. [ ] Identificar as 3 suites quebradas exatamente
2. [ ] Adicionar helper `tests/helpers/auth-mock.js` que injeta `req.headers.cookie = 'aios_session=<token>'` ou bypass via env `TEST_BYPASS_AUTH=1`
3. [ ] Atualizar as 31 falhas pra usar o helper
4. [ ] `npm test` retorna `0 failed`
5. [ ] Nenhum skip novo introduzido
6. [ ] CI re-ativa gate `tests` como blocking

## Trade-offs

- **Opção A — mock auth nos tests:** limpo, isolado, zero mudança em produção
- **Opção B — env var `TEST_BYPASS_AUTH` no server:** mais simples (3 linhas), mas adiciona superfície de ataque em produção se mal configurado. **Não recomendado.**

## File List

_(a preencher durante implementação)_

## Dev Notes

- Auth check está em `packages/audiovisual/lib/api-server.js:126` função `checkAuth(req, res)`
- Token derivado: `crypto.createHash('sha256').update(AUTH_PASSWORD).digest('hex').substring(0, 32)`
- Public paths (bypassam): `/api/login`, `/api/health`, `/health`, `/favicon.ico`
