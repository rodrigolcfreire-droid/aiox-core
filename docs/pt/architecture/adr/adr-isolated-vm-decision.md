<!-- Tradução: PT-BR | Original: /docs/en/architecture/adr/adr-isolated-vm-decision.md | Sincronização: 2026-01-26 -->

# ADR: Compatibilidade isolated-vm com macOS

**Status:** Aceito
**Data:** 2026-01-04
**Story:** TD-6 - Estabilidade de CI e Melhorias de Cobertura de Testes
**Autor:** @devops (Gage)

## Contexto

Durante testes de CI, observamos crashes SIGSEGV no macOS com Node.js 18.x e 20.x ao usar `isolated-vm`. Isso afeta a cobertura da matriz de CI.

## Descobertas da Investigação

### Configurações Afetadas

| Plataforma  | Versão Node  | Status           |
| ----------- | ------------ | ---------------- |
| macOS ARM64 | 18.x         | ❌ Crash SIGSEGV |
| macOS ARM64 | 20.x         | ❌ Crash SIGSEGV |
| macOS ARM64 | 22.x         | ✅ Funciona      |
| macOS x64   | Todas        | ✅ Funciona      |
| Ubuntu      | Todas        | ✅ Funciona      |
| Windows     | Todas        | ✅ Funciona      |

### Causa Raiz

**Issue GitHub:** [laverdet/isolated-vm#424](https://github.com/laverdet/isolated-vm/issues/424) - "Segmentation fault on Node 20 macos arm64"

O problema é uma incompatibilidade conhecida entre os bindings nativos do `isolated-vm` e builds Node.js ARM64 no macOS para versões 18.x e 20.x. O crash ocorre durante a inicialização do módulo nativo.

### Versão Atual

- **Instalada:** `isolated-vm@5.0.4`
- **Última Disponível:** `isolated-vm@6.0.2`

## Decisão

**Manter exclusão atual da matriz de CI** para macOS + Node 18/20.

### Justificativa

1. **Baixo Impacto:** macOS não é um alvo de deploy de produção; é apenas para estações de trabalho de desenvolvedores
2. **Node 22 Funciona:** Desenvolvedores no macOS podem usar Node 22.x
3. **Cobertura de CI Aceitável:** 7/9 combinações da matriz (78%) é suficiente
4. **Risco de Upgrade:** v6.x é uma versão major com potenciais breaking changes
5. **Workaround Não-Invasivo:** Simples exclusão na matriz em config de CI

### Workaround Atual (ci.yml)

```yaml
matrix:
  exclude:
    - os: macos-latest
      node: '18'
    - os: macos-latest
      node: '20'
```

## Alternativas Consideradas

| Opção              | Esforço | Risco  | Cobertura | Decisão             |
| ------------------ | ------- | ------ | --------- | ------------------- |
| Manter exclusão    | Nenhum  | Baixo  | 78%       | ✅ **Selecionada**  |
| Upgrade para v6.x  | Médio   | Médio  | 100%?     | ❌ Testar primeiro  |
| Substituir por vm2 | Alto    | Alto   | 100%      | ❌ Breaking changes |
| Usar Node.js vm    | Médio   | Médio  | 100%      | ❌ Menos seguro     |

## Ações Futuras

1. **Monitorar:** Acompanhar [isolated-vm#424](https://github.com/laverdet/isolated-vm/issues/424) para correções
2. **Testar v6.x:** Quando houver tempo, testar `isolated-vm@6.0.2` no macOS ARM64
3. **Reavaliar:** Se v6.x corrigir o problema, considerar upgrade em sprint futuro

## Consequências

### Positivas

- Pipeline de CI permanece estável
- Sem alterações de código necessárias
- Workflow de desenvolvimento não afetado (Node 22 funciona)

### Negativas

- 2 combinações da matriz de CI indisponíveis
- Desenvolvedores macOS devem usar Node 22.x para compatibilidade total

## Referências

- [isolated-vm#424 - Segmentation fault on Node 20 macos arm64](https://github.com/laverdet/isolated-vm/issues/424)
- [isolated-vm releases](https://github.com/laverdet/isolated-vm/releases)
- [Story TD-6](../../../docs/stories/v2.1/sprint-18/story-td-6-ci-stability.md)
