# Lottie Assets

Lottie JSON roda no preview via [lottie-web](https://github.com/airbnb/lottie-web) mas
**não é renderizado pelo export FFmpeg atual** (FFmpeg não tem renderer Lottie nativo).

Pra usar Lottie no export precisaríamos de:
- `puppeteer` + headless Chrome renderizando cada frame → PNG sequence → FFmpeg
- ou biblioteca como `skottie` (Google, Skia) via binding

**Por enquanto esta pasta fica como placeholder**. Lottie só entra quando fizer
sentido pagar o custo de infra pra renderizar no export.

## Fontes públicas (quando ativar)

- [LottieFiles](https://lottiefiles.com/) — filtrar por licença CC0/CC-BY
- [IconScout Lottie](https://iconscout.com/lotties) — grátis com atribuição
- [Lordicon](https://lordicon.com/) — pago
