<!--
  Traducción: ES
  Original: /docs/en/installation/README.md
  Última sincronización: 2026-01-26
-->

# Documentación de Instalación de Synkra AIOS

**Versión:** 2.1.0
**Última Actualización:** 2025-01-24

---

## Descripción General

Este directorio contiene documentación completa de instalación y configuración para Synkra AIOS.

---

## Índice de Documentación

| Documento | Descripción | Audiencia |
|----------|-------------|----------|
| [Guía de Inicio Rápido](./v2.1-quick-start.md) | Tutorial completo de instalación | Nuevos usuarios |
| [Solución de Problemas](./troubleshooting.md) | Problemas comunes y soluciones | Todos los usuarios |
| [Preguntas Frecuentes](./faq.md) | Preguntas frecuentes | Todos los usuarios |
| [Guía de Migración](./migration-v2.0-to-v2.1.md) | Actualización desde v2.0 | Usuarios existentes |

---

## Enlaces Rápidos

### Nueva Instalación

```bash
npx @synkra/aios-core install
```

Consulte la [Guía de Inicio Rápido](./v2.1-quick-start.md) para instrucciones detalladas.

### Actualización

```bash
npx @synkra/aios-core install --force-upgrade
```

Consulte la [Guía de Migración](./migration-v2.0-to-v2.1.md) para cambios importantes y procedimiento de actualización.

### ¿Tiene Problemas?

1. Consulte la [Guía de Solución de Problemas](./troubleshooting.md)
2. Busque en las [Preguntas Frecuentes](./faq.md)
3. Abra un [Issue en GitHub](https://github.com/SynkraAI/aios-core/issues)

---

## Requisitos Previos

- Node.js 18.0.0+
- npm 9.0.0+
- Git 2.30+

---

## Plataformas Soportadas

| Plataforma | Estado |
|----------|--------|
| Windows 10/11 | Soporte Completo |
| macOS 12+ | Soporte Completo |
| Ubuntu 20.04+ | Soporte Completo |
| Debian 11+ | Soporte Completo |

---

## IDEs Soportados

| IDE | Activación de Agentes |
|-----|------------------|
| Claude Code | `/dev`, `/qa`, etc. |
| Cursor | `@dev`, `@qa`, etc. |
| Windsurf | `@dev`, `@qa`, etc. |
| Trae | `@dev`, `@qa`, etc. |
| Roo Code | Selector de modo |
| Cline | `@dev`, `@qa`, etc. |
| Gemini CLI | Mención en el prompt |
| GitHub Copilot | Modos de chat |

---

## Documentación Relacionada

- [Estándares de Código](../framework/coding-standards.md)
- [Stack Tecnológico](../framework/tech-stack.md)
- [Arquitectura](../architecture/)
- [Registro de Cambios](../CHANGELOG.md)

---

## Soporte

- **Issues de GitHub**: [@synkra/aios-core/issues](https://github.com/SynkraAI/aios-core/issues)
- **Documentación**: [docs/](../)
