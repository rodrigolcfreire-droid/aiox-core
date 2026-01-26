<!--
  Tradução: PT-BR
  Original: /docs/en/installation/README.md
  Última sincronização: 2026-01-26
-->

# Documentação de Instalação do Synkra AIOS

**Versão:** 2.1.0
**Última Atualização:** 2025-01-24

---

## Visão Geral

Este diretório contém documentação abrangente de instalação e configuração para o Synkra AIOS.

---

## Índice de Documentação

| Documento | Descrição | Público-alvo |
|----------|-------------|----------|
| [Guia de Início Rápido](./v2.1-quick-start.md) | Passo a passo completo de instalação | Novos usuários |
| [Solução de Problemas](./troubleshooting.md) | Problemas comuns e soluções | Todos os usuários |
| [FAQ](./faq.md) | Perguntas frequentes | Todos os usuários |
| [Guia de Migração](./migration-v2.0-to-v2.1.md) | Atualização a partir da v2.0 | Usuários existentes |

---

## Links Rápidos

### Nova Instalação

```bash
npx @synkra/aios-core install
```

Consulte o [Guia de Início Rápido](./v2.1-quick-start.md) para instruções detalhadas.

### Atualização

```bash
npx @synkra/aios-core install --force-upgrade
```

Consulte o [Guia de Migração](./migration-v2.0-to-v2.1.md) para mudanças incompatíveis e procedimento de atualização.

### Está com Problemas?

1. Consulte o [Guia de Solução de Problemas](./troubleshooting.md)
2. Pesquise no [FAQ](./faq.md)
3. Abra uma [Issue no GitHub](https://github.com/SynkraAI/aios-core/issues)

---

## Pré-requisitos

- Node.js 18.0.0+
- npm 9.0.0+
- Git 2.30+

---

## Plataformas Suportadas

| Plataforma | Status |
|----------|--------|
| Windows 10/11 | Suporte Completo |
| macOS 12+ | Suporte Completo |
| Ubuntu 20.04+ | Suporte Completo |
| Debian 11+ | Suporte Completo |

---

## IDEs Suportadas

| IDE | Ativação de Agentes |
|-----|------------------|
| Claude Code | `/dev`, `/qa`, etc. |
| Cursor | `@dev`, `@qa`, etc. |
| Windsurf | `@dev`, `@qa`, etc. |
| Trae | `@dev`, `@qa`, etc. |
| Roo Code | Seletor de modo |
| Cline | `@dev`, `@qa`, etc. |
| Gemini CLI | Menção no prompt |
| GitHub Copilot | Modos de chat |

---

## Documentação Relacionada

- [Padrões de Código](../framework/coding-standards.md)
- [Stack Tecnológico](../framework/tech-stack.md)
- [Arquitetura](../architecture/)
- [Changelog](../CHANGELOG.md)

---

## Suporte

- **Issues no GitHub**: [@synkra/aios-core/issues](https://github.com/SynkraAI/aios-core/issues)
- **Documentação**: [docs/](../)
