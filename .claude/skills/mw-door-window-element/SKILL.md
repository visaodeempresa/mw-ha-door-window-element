---
name: mw-door-window-element
description: Trabalhar no custom:mw-door-window-element (barra de porta/janela do picture-elements do HA). Use ao mexer em cores/brilho/ícones/geometria da barra, adicionar propriedade, publicar release pelo HACS, ou quando o dono disser "a porta não muda de cor na planta", "a barra sumiu", "o ícone ficou deitado" ou "o HACS não mostra versão nova".
---

# mw-door-window-element — fábrica

Arquivo único `dist/mw-door-window-element.js` (fonte **e** artefato, sem
build). JS puro. Instala por HACS, tipo Dashboard.
Regras da família: `IA/rules/projects/mw-ha-cards.md`.

## É elemento, não card

Só vive dentro de `type: picture-elements`, na lista `elements:`. Não aparece
no seletor de cards e **não tem editor visual** (v0.1.0): o picture-elements
edita elemento custom por YAML.

## Anatomia

- `DEFAULTS` — toda propriedade nasce aqui.
- `resolveMode()` — quatro modos (`open` / `closed` / `unavailable` /
  `unknown`) a partir de listas de estados; serve para `binary_sensor`,
  `cover` e `lock`. Estado fora das listas cai em `unknown` **de propósito**:
  é o que faz a planta denunciar sensor estranho em vez de mentir "fechada".
- `withAlpha()` — o brilho é a cor do estado com outro alfa. Cor nomeada ou
  `var(--...)` volta inteira (sem transparência) — comportamento aceito.
- `_applyGeometry()` — escreve no **host**, e só as chaves preenchidas. O
  picture-elements aplica o `style:` do YAML no host logo após criar o
  elemento; como o `setConfig` roda antes, a config só vence porque
  reaplicamos… **cuidado ao mexer**: se um dia o HA passar a aplicar o
  `style:` depois de todo `hass`, a config perde. Conferir na tela.
- `_render()` — redesenha só quando a assinatura `modo|estado` muda; o
  picture-elements empurra `hass` a cada mudança de qualquer entidade.

## Verificação (o que faz a tarefa estar pronta)

```bash
node --check dist/mw-door-window-element.js
node tools/probe.js                       # sem navegador
curl -s http://192.168.1.71:8123/hacsfiles/mw-ha-door-window-element/mw-door-window-element.js \
  | grep -o '%c [0-9.]*'
git log -1 --pretty='%G? %an'             # G + MAYCON WILLIAN OLIVEIRA
```

A conferência **de tela** é do dono (regra global 30).

## Armadilhas (com sintoma)

| Sintoma | Causa | Correção |
|---|---|---|
| Barra não aparece na planta | elemento usado como card, ou sem geometria e sem `style:` | tem que estar em `picture-elements`; dar `length`/`thickness` ou o `style:` |
| Barra aparece do tamanho errado | `rotate` no `style:` **e** na config | usar um dos dois; a config reescreve o `transform` inteiro |
| Ícone deitado junto com a barra | o `rotate` do host gira o conteúdo | `icon_upright: true` |
| Cor muda mas o brilho não | `color_<modo>_glow` fixo no YAML | apagar a chave e deixar derivar |
| Tudo vira "desconhecido" | entidade não é binary_sensor/cover/lock | ver as listas em `OPEN_STATES` / `CLOSED_STATES` |
| `curl` mostra código novo, tela não muda | `.js.gz` velho (deploy manual por SSH) | subir `.js` **e** `.js.gz` (`IA/runbooks/deploy-card-hacs-ssh.md`) |
| Repositório novo, workflow certo, zero releases | o primeiro push não cria execução | publicar a v0.1.0 pela tag (`git tag -s`), o `release.yml` cuida |
| HACS não vê a release recém-publicada | `available_version` em cache | `hacs/repository/download` com `version="vX.Y.Z"` explícita |

## Fluxo

**v0.1.0 saiu direto na `main`** a pedido do dono (economia de tokens). Depois
do OK dele na tela, migrar para o padrão da família:
`feature/** → develop → release → main`, editor `<ha-form>`, `PLANO.md`,
`HISTORICO.md` e destilação para `IA/`.
