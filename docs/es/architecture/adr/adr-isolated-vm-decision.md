<!-- Traduccion: ES | Original: /docs/en/architecture/adr/adr-isolated-vm-decision.md | Sincronizacion: 2026-01-26 -->

# ADR: Compatibilidad de isolated-vm con macOS

**Estado:** Aceptado
**Fecha:** 2026-01-04
**Historia:** TD-6 - Mejoras de Estabilidad de CI y Cobertura de Tests
**Autor:** @devops (Gage)

## Contexto

Durante las pruebas de CI, observamos crashes SIGSEGV en macOS con Node.js 18.x y 20.x al usar `isolated-vm`. Esto afecta la cobertura de la matriz de CI.

## Hallazgos de la Investigacion

### Configuraciones Afectadas

| Plataforma  | Version Node | Estado           |
| ----------- | ------------ | ---------------- |
| macOS ARM64 | 18.x         | ❌ Crash SIGSEGV |
| macOS ARM64 | 20.x         | ❌ Crash SIGSEGV |
| macOS ARM64 | 22.x         | ✅ Funciona      |
| macOS x64   | Todas        | ✅ Funciona      |
| Ubuntu      | Todas        | ✅ Funciona      |
| Windows     | Todas        | ✅ Funciona      |

### Causa Raiz

**Issue de GitHub:** [laverdet/isolated-vm#424](https://github.com/laverdet/isolated-vm/issues/424) - "Segmentation fault on Node 20 macos arm64"

El problema es una incompatibilidad conocida entre los bindings nativos de `isolated-vm` y los builds ARM64 de Node.js en macOS para las versiones 18.x y 20.x. El crash ocurre durante la inicializacion del modulo nativo.

### Version Actual

- **Instalada:** `isolated-vm@5.0.4`
- **Ultima Disponible:** `isolated-vm@6.0.2`

## Decision

**Mantener la exclusion actual de la matriz de CI** para macOS + Node 18/20.

### Justificacion

1. **Bajo Impacto:** macOS no es un objetivo de deployment de produccion; es solo para estaciones de trabajo de desarrolladores
2. **Node 22 Funciona:** Los desarrolladores en macOS pueden usar Node 22.x
3. **Cobertura de CI Aceptable:** 7/9 combinaciones de matriz (78%) es suficiente
4. **Riesgo de Upgrade:** v6.x es una version mayor con posibles breaking changes
5. **Workaround No Invasivo:** Simple exclusion de matriz en config de CI

### Workaround Actual (ci.yml)

```yaml
matrix:
  exclude:
    - os: macos-latest
      node: '18'
    - os: macos-latest
      node: '20'
```

## Alternativas Consideradas

| Opcion            | Esfuerzo | Riesgo | Cobertura | Decision            |
| ----------------- | -------- | ------ | --------- | ------------------- |
| Mantener exclusion | Ninguno | Bajo   | 78%       | ✅ **Seleccionada** |
| Upgrade a v6.x    | Medio    | Medio  | 100%?     | ❌ Probar primero   |
| Reemplazar con vm2 | Alto    | Alto   | 100%      | ❌ Breaking changes |
| Usar Node.js vm   | Medio    | Medio  | 100%      | ❌ Menos seguro     |

## Acciones Futuras

1. **Monitorear:** Vigilar [isolated-vm#424](https://github.com/laverdet/isolated-vm/issues/424) para correcciones
2. **Probar v6.x:** Cuando haya tiempo, probar `isolated-vm@6.0.2` en macOS ARM64
3. **Re-evaluar:** Si v6.x corrige el problema, considerar upgrade en sprint futuro

## Consecuencias

### Positivas

- El pipeline de CI permanece estable
- No se requieren cambios de codigo
- Flujo de trabajo de desarrollo no afectado (Node 22 funciona)

### Negativas

- 2 combinaciones de matriz de CI no disponibles
- Desarrolladores en macOS deben usar Node 22.x para compatibilidad completa

## Referencias

- [isolated-vm#424 - Segmentation fault on Node 20 macos arm64](https://github.com/laverdet/isolated-vm/issues/424)
- [isolated-vm releases](https://github.com/laverdet/isolated-vm/releases)
- [Story TD-6](../../../docs/stories/v2.1/sprint-18/story-td-6-ci-stability.md)
