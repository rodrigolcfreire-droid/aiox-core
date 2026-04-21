# UX Command Center — Rascunho v2 (Home)

Rascunho visual da home de `uxcentrodecomando.com`. **Não toca no original** (`docs/examples/ux-command-center/index.html`). Apenas arquivos novos nesta pasta.

Escopo estrito: somente a view "entrada" + header "CENTRO DE COMANDO UX". Outras views (saúde, agentes, squads, audiovisual, segurança, relatórios) ficam fora deste rascunho e aparecem apenas como CTAs/links saindo da home.

---

## Direções

### Direção A — "Command Center Evoluído"
Arquivo: `index-direction-a.html`

Mantém o layout atual (hero centralizado, 2 botões primários empilhados) e eleva o polish: halo cyan respirando atrás do hero, logo com pulse de glow, typing effect no pre-title "INICIALIZANDO SISTEMA", parallax sutil do starfield ao mouse, shimmer nos botões em hover. Abaixo do hero aparecem **4 KPI cards glassmórficos** com telemetria em tempo real (serviços online, uptime tunnel, última atividade, agentes ativos) e uma status bar fixa no rodapé com relógio e latência. Entrega mais densa de informação sem quebrar a identidade de "tela de boot de comando".

### Direção B — "Command Bridge"
Arquivo: `index-direction-b.html`

Reformula o layout em **grid de 3 colunas**: sidebar de navegação à esquerda (ícones + label, atalhos para Home, Saúde, Agentes, Squads, Audiovisual, Segurança, Relatórios, Configurações), hero central com **logo grande (120px)** e os dois CTAs, e **rail direito com feed vertical de eventos** em tempo real (commits, renders, alertas, security checks) no estilo terminal/log. Topbar enxuta com breadcrumb `[BRIDGE] / HOME`. Postura mais operacional — o usuário abre o dashboard já vendo nav, missão e pulso do sistema simultaneamente.

---

## Trade-offs

| Aspecto | Direção A | Direção B |
|---|---|---|
| Familiaridade visual | Alta (evolução direta do atual) | Média (reestrutura o layout) |
| Densidade de info na home | Média (hero + 4 KPIs) | Alta (nav + hero + feed de 5 eventos) |
| Peso visual | Leve, cinematográfico | Operacional, denso |
| Mobile (375px) | Cai naturalmente para 2×2 KPIs | Sidebar vira chip-row horizontal, feed oculto |
| Trabalho para estender | Baixo — padrões reutilizáveis | Médio — layout tri-coluna precisa de disciplina |
| Risco de "poluir" a marca | Baixo | Médio — o feed à direita compete por atenção com o hero |

---

## Preservação do DNA

Ambas as direções preservam, sem alteração:

- Paleta: navy (`#0a0e1a` / `#020617`), cyan signature (`#00e5cc`), sky (`#38bdf8`, `#85ccff`)
- Gradient assinatura: `linear-gradient(180deg, #f5fbff 0%, #85ccff 46%, #00e5cc 100%)` nos títulos e logo, e `linear-gradient(135deg, #00e5cc, #38bdf8)` nos botões primários
- Fontes: Chakra Petch (títulos), Inter (body), JetBrains Mono (telemetria)
- Starfield de dots radiais sobre gradient radial + glassmorphism (`rgba(26,31,46,0.82)` + `border rgba(255,255,255,0.1)`)
- Logo SVG **copiado idêntico** do original (mesmos 12 elementos, mesmo `cyan-gradient`)
- Textos âncora intactos: "INICIALIZANDO SISTEMA", "CENTRO DE COMANDO", "UX", "SETOR AUDIOVISUAL INTELIGENTE", "SEGURANCA DO SISTEMA"

O que evolui (sem descaracterizar):

- Halo cyan respirando atrás do hero (A e B)
- Microinterações (shimmer no CTA, pulse no logo, typing no pre-title)
- Hierarquia tipográfica mais refinada (line-height, letter-spacing ajustados)
- Status bar / feed de eventos — elementos novos que reforçam a vibe "command center" sem substituir a hero

---

## Preview

URLs de preview (quando publicado):

- Direção A: `https://uxcentrodecomando.com/v2/index-direction-a.html`
- Direção B: `https://uxcentrodecomando.com/v2/index-direction-b.html`

Local:

- `open docs/examples/ux-command-center-v2/index-direction-a.html`
- `open docs/examples/ux-command-center-v2/index-direction-b.html`

---

## Regras respeitadas

- HTML standalone, CSS inline, sem imports locais (fonts via Google CDN)
- Dados mocados com `<!-- MOCK: ... -->` indicando o endpoint futuro
- Responsivo: 375px mobile, 1920px desktop (breakpoints em 520/860/900/1200px)
- Acessibilidade: `aria-label`, `aria-hidden` em decorativos, focus states com outline cyan, contraste WCAG AA
- Sem libs pesadas: zero jQuery, zero Anime.js, só CSS + JS vanilla
- Respeita `prefers-reduced-motion: reduce` (desliga typing, pulse, parallax, breathe)
- `docs/examples/ux-command-center/index.html` **não foi modificado**

---

## Aplicado em produção (home)

**Data:** 2026-04-21

Design system extraído da Direção A e aplicado na view `#entrada` (home) do index.html de produção.

### Arquivos criados

| Arquivo | Descrição |
|---|---|
| `docs/examples/ux-command-center/design-system/tokens.css` | 105 CSS custom properties `--ds-*`: cores, gradients, tipografia, spacing, radii, sombras, transições, z-index |
| `docs/examples/ux-command-center/design-system/components.css` | Classes reutilizáveis: `.glass-panel`, `.hero-pre`, `.hero-title`, `.hero-subtitle`, `.logo--pulse`, `.starfield`, `.halo-breath`, `.btn`, `.btn--primary`, `.btn--secondary`, `.kpi-card` (+ variantes), `.kpi-grid`, `.status-bar` |

### Modificações em `docs/examples/ux-command-center/index.html`

- Dois `<link>` inseridos no `<head>` (linhas 14-15): `design-system/tokens.css` e `design-system/components.css`
- Seção `<section ... id="entrada">` substituída integralmente pela versão Direção A:
  - Hero com typing effect ("INICIALIZANDO SISTEMA"), halo cyan respirante, logo com pulse
  - 4 KPI cards glassmórficos (Serviços Online, Uptime Tunnel, Última Atividade, Agentes Ativos)
  - Status bar fixa no rodapé com relógio e latência (visível apenas quando `#entrada` está ativa)
  - Botões `showView('setor-audiovisual')` e `showView('seguranca')` preservados com as mesmas funções
  - Micro-JS encapsulado em IIFE: typing, parallax, clock, MutationObserver para status bar, logo pulse
- Linha count: 7310 → 7544 (somente a seção `#entrada` foi alterada)

### Seções não tocadas

Todas as outras `view-section` permanecem byte-a-byte idênticas: `#saude`, `#agentes`, `#workflow`, `#memoria`, `#constituicao`, `#relatorios`, `#painel-agentes`, `#squads`, `#setor-audiovisual`, `#seguranca`, e todos os sub-painéis av-* e agent-*.
