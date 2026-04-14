# assets-editor/ — Biblioteca open-source pro editor AIOX

Versão **2.0.0** (2026-04-13) — offline-authored + external research

Combina 23 assets autorados MIT pela AIOX + 12 templates externos verificados
(pycaps MIT + PupCaps Apache-2.0). Total 35 assets, ~188KB.

## Estrutura

```
assets-editor/
├── captions/            # CSS — legendas autoradas AIOX (MIT)
├── subtitle-styles/     # ASS/SSA — styles pro export FFmpeg (MIT)
├── kinetic-text/        # CSS — tipografia cinética (MIT)
├── lower-thirds/        # CSS — bars de nome (MIT)
├── titles/              # CSS — títulos intro (MIT)
├── external/
│   ├── pycaps/          # 11 templates de github.com/francozanardi/pycaps (MIT)
│   └── pupcaps/         # 1 template de github.com/hosuaby/PupCaps (Apache-2.0)
├── references/          # URLs + notas (sem binários)
├── lottie/              # (placeholder — export FFmpeg não renderiza Lottie)
├── ae-presets/          # (VAZIO — formato não portável)
├── premiere-presets/    # (VAZIO — formato não portável)
├── README.md
└── catalogo.json
```

## Como usar

### Preview (browser)
Importe o CSS no `av-editor.html` ou cole o keyframe/regra dentro da `<style>` existente.
Aplica a classe no elemento `.subtitle-text`:

```html
<link rel="stylesheet" href="/assets-editor/captions/opus-word-by-word.css">
<div class="subtitle-text caption-opus anim-in">TEXTO</div>
```

### Export (FFmpeg / ASS)
Os templates em `subtitle-styles/*.ass` têm placeholders `{W}`, `{H}`, `{FONT_SIZE}`,
`{FONT_SIZE_HL}`, `{MARGIN_V}`. Substitua antes de alimentar FFmpeg:

```js
const tpl = fs.readFileSync('subtitle-styles/viral-bold.ass', 'utf8');
const ass = tpl
  .replace(/{W}/g, videoWidth)
  .replace(/{H}/g, videoHeight)
  .replace(/{FONT_SIZE}/g, Math.round(videoWidth / 13))
  .replace(/{FONT_SIZE_HL}/g, Math.round(videoWidth / 11))
  .replace(/{MARGIN_V}/g, Math.round(videoHeight * 0.12));
```

## Mapping pros presets internos

Ligação direta com `packages/audiovisual/lib/subtitle-presets.js`:

| Cenário pedido | Asset recomendado | Como integrar |
|---|---|---|
| **Legenda estilo Opus** | `captions/opus-word-by-word.css` + `wordsPerCaption=1` | Preset novo `opus-highlight`: Kanit 56px branco, outline 2px, highlight chip amarelo |
| **Legenda estilo Reels agressivo** | `captions/reels-aggressive.css` + `subtitle-styles/viral-bold.ass` | Preset `reels-aggressive`: Bebas Neue 72px uppercase, outline 4px preto, accent #E91E63 |
| **Legenda clean institucional** | `captions/clean-institutional.css` + `subtitle-styles/clean-institutional.ass` | Preset `clean-corp`: Inter 40px branco, shadow sutil, position center-bottom |
| **Legenda com palavras destacadas** | `captions/highlighted-keywords.css` | Preset `keywords-hl`: Kanit 60px + highlight engine em `subtitles.js` (já existe detector em `HIGHLIGHT_PATTERNS`) |

## Assets coletados (v1)

- **10 captions CSS** — opus, hormozi, beasty, tiktok, reels, clean, karaoke, neon, cinematic, highlighted-keywords
- **4 subtitle-styles ASS** — viral-bold, clean-institutional, neon-gaming, cinematic-serif
- **4 kinetic-text CSS** — word-bounce, typewriter, stagger-slide, glitch
- **3 lower-thirds CSS** — bar-minimal, gradient-pill, news-ticker
- **2 titles CSS** — big-impact, split-reveal

**Total**: 23 assets, ~9KB. Zero binários, zero dependências externas.

## Fase 2 executada — fontes externas verificadas

Licenças **conferidas no arquivo LICENSE de cada repo**:

### pycaps — 11 templates (MIT)
- **Fonte**: https://github.com/francozanardi/pycaps
- **License**: MIT (Copyright 2025 Franco Zanardi) — ver `external/pycaps/LICENSE`
- **Convenção de seletores CSS**: `.word`, `.word-being-narrated`, `.word-already-narrated`, `.word-not-narrated-yet` — facilita adaptação pro seu word-by-word
- **Templates baixados**: classic, default, explosive, fast, hype, line-focus, minimalist, neo-minimal, retro-gaming, vibrant, word-focus
- **Obs**: referências a `@font-face url('black.ttf')` precisam de substituição — troque pelas fontes que você já tem (Google Fonts: Anton, Bebas, Inter)

### PupCaps — 1 template (Apache-2.0)
- **Fonte**: https://github.com/hosuaby/PupCaps
- **License**: Apache-2.0 (Hosu) — ver `external/pupcaps/LICENSE`
- **Obs**: Apache-2.0 exige preservar NOTICE se redistribuir; uso interno OK
- **Destaque**: karaoke com `@keyframes shrinkPadding` e highlight roxo — ótimo pra adaptar pro `caption-karaoke` autorado

### Fontes AVALIADAS mas NÃO baixadas
- **animate.css** — licença **Hippocratic** (restritiva/ética, não é OSI-approved) — REJEITADA
- **remotion-subtitles** — MIT mas templates são React+Remotion, não CSS puro — REFERÊNCIA apenas
- **JASSUB / libass** — MIT/ISC mas são renderers de runtime, não templates — não se aplica
- **vista (zernonia/vista)** — MIT mas estilo é UnoCSS sem templates extraíveis — REFERÊNCIA

### Fontes tipográficas recomendadas (não baixadas, linka via Google Fonts)
Todas SIL OFL (uso comercial liberado): Kanit, Anton, Archivo Black, Bebas Neue,
Montserrat, Inter, Oswald, Orbitron, Playfair Display, Rajdhani. Adicione `<link>`
do Google Fonts em `av-editor.html`.

## Gaps que permanecem

- **Lottie** pendente de renderer no export (FFmpeg não faz nativo)
- **Fontes .ttf** não incluídas — dependência externa via Google Fonts CDN

## Fase 3 — integração no editor AIOX

Proposta de mudanças no código real:

### 3.1 Novos presets em `subtitle-presets.js`
Adicionar 4 presets novos espelhando os 4 cenários do Mapping acima:

```js
// packages/audiovisual/lib/subtitle-presets.js
{
  id: 'opus-highlight',
  name: 'Opus Highlight',
  expert: 'shared',
  style: { font: 'Kanit', size: 56, color: '#FFFFFF', strokeColor: '#000', strokeWidth: 2,
           weight: '900', position: 'center-bottom', uppercase: true },
  highlight: { mode: 'word-by-word', color: '#FFD700' },
}
// repeat for reels-aggressive, clean-corp, keywords-hl
```

### 3.2 Injetar CSS no `av-editor.html`
Copiar `@keyframes` dos arquivos `captions/*.css` pro `<style>` inline (ou servir via static route). Trocar `applyAnimationClasses` pra suportar os novos nomes (`opus`, `hormozi`, `beasty`).

### 3.3 ASS templates no export
Em `edit-export.js#buildCustomASS`, carregar os templates `.ass` e substituir placeholders. Já tem mapping de preset→ASS, só acrescentar os novos IDs.

### 3.4 UI
Na aba **Animação** do editor, adicionar as novas opções de `animIn` correspondentes aos assets (ex: `opus`, `hormozi`, `beasty`, `karaoke`, `glitch`).

Custo estimado Fase 3: ~30min de edição focada em 3 arquivos.

---

**Licença global desta pasta**: MIT. Livre pra uso comercial, modificação, redistribuição.
