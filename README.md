# MW Door / Window Element

Elemento de **picture-elements** do Home Assistant: a barrinha que representa
uma **porta** ou uma **janela** na planta, pintada pelo estado — aberta,
fechada, indisponível, desconhecido — com brilho e ícone de exceção.

Troca o bloco de **4 `conditional` + 4 `custom:button-card`** (~110 linhas por
porta) por **um elemento de 8 linhas**, sem perder nada do visual.

```yaml
type: custom:mw-door-window-element
entity: binary_sensor.cozinha_porta_da_cozinha
name: PORTA DA COZINHA
left: calc(100% - 72.4%)
top: 16.2%
length: 10%
thickness: 0.8%
rotate: 90
```

> É um **elemento**, não um card: só funciona dentro de
> `type: picture-elements` (na lista `elements:`).

## Instalação (HACS)

HACS → Dashboard → ⋮ → *Custom repositories* →
`https://github.com/visaodeempresa/mw-ha-door-window-element` → tipo
**Dashboard** → Download. Depois, hard refresh no navegador.

## Como funciona

O host do elemento **é a barra**. Dá para posicionar de dois jeitos:

- pela **config** (`left`, `top`, `length`, `thickness`, `rotate`, `scale`) —
  legível e fácil de gerar por script;
- pelo **`style:`** do picture-elements, como qualquer elemento nativo.

Se as duas formas aparecerem no mesmo elemento, **a config vence** (ela é
aplicada depois que o picture-elements escreve o `style:`).

O estado é resolvido para quatro modos, o que faz o elemento servir também
para `cover` e `lock`:

| Modo | Estados |
|---|---|
| `open` | `on`, `open`, `opening`, `detected`, `unlocked` |
| `closed` | `off`, `closed`, `closing`, `clear`, `locked` |
| `unavailable` | `unavailable` ou entidade que não existe |
| `unknown` | `unknown`, vazio, ou **qualquer estado fora das listas** |

## Opções

### Entidade

| Opção | Padrão | O que faz |
|---|---|---|
| `entity` | — | **obrigatória** |
| `name` | `""` | tooltip; vazio = `friendly_name` |
| `invert` | `false` | sensor invertido (`on` = fechada) |

### Geometria (tudo opcional)

| Opção | Padrão | O que faz |
|---|---|---|
| `left` / `top` | `""` | posição; aceita `%` e `calc(...)` |
| `length` | `""` | comprimento da barra (vira `width`) |
| `thickness` | `""` | espessura da barra (vira `height`) |
| `rotate` | `null` | graus (`90` = vertical) |
| `scale` | `null` | escala |
| `border_radius` | `"0%"` | cantos |

### Aparência

| Opção | Padrão |
|---|---|
| `opacity` | `1` |
| `glow` | `true` |
| `glow_blur` / `glow_spread` | `20` / `5` (px) |
| `glow_opacity` | `0.75` — alfa do brilho derivado da cor do estado |
| `color_open` | `rgba(127, 255, 0, 1)` |
| `color_closed` | `rgba(255, 69, 0, 1)` |
| `color_unavailable` | `rgba(255, 99, 71, 0.7)` |
| `color_unknown` | `rgba(255, 99, 71, 0.7)` |
| `color_<modo>_glow` | `""` = derivado da cor do estado |
| `hide_<modo>` | `false` — some com a barra naquele estado |

O brilho sai da própria cor do estado com outro alfa (entende `rgb`, `rgba` e
`#hex`); cor nomeada ou `var(--...)` sai inteira, sem transparência.

### Ícones

Aparecem só nos estados que tiverem ícone configurado — por padrão, as
exceções.

| Opção | Padrão |
|---|---|
| `icon_open` / `icon_closed` | `""` (barra limpa) |
| `icon_unavailable` | `mdi:cancel` |
| `icon_unknown` | `mdi:crosshairs-question` |
| `color_icon_open` | `rgba(50, 205, 50, 1)` |
| `color_icon_closed` | `rgba(178, 34, 34, 1)` |
| `color_icon_unavailable` | `rgba(255, 255, 0, 1)` |
| `color_icon_unknown` | `rgba(255, 255, 255, 0.8)` |
| `icon_size` | `4.2vh` |
| `icon_scale` | `0.85` |
| `icon_offset_y` | `5%` |
| `icon_upright` | `false` — `true` desfaz o `rotate` só no ícone |

### Ações

`tap_action` (padrão `more-info`), `hold_action` e `double_tap_action` aceitam
string (`more-info`, `toggle`, `navigate`, `url`, `call-service`, `none`) ou
o objeto completo do HA (`{action: navigate, navigation_path: /planta}`).
Para a forma string, use `navigation_path`, `url_path`, `service` e
`service_data` no nível de cima.

## Exemplos

`examples/porta-da-cozinha.yaml` — o bloco original convertido, a variante com
`style:`, janela invertida com ícone de pé e barra sem brilho.

## Desenvolvimento

Arquivo único, **sem build**: `dist/mw-door-window-element.js` é fonte e
artefato.

```bash
node --check dist/mw-door-window-element.js
node tools/probe.js   # instancia o elemento sem navegador
```

Push na `main` tocando `dist/**` ou `hacs.json` → bump semântico → tag →
Release → o HACS avisa a atualização.

## Pendente (v0.2.0)

- Editor visual (`<ha-form>`) — o picture-elements ainda edita elemento
  custom por YAML; entra junto com o suporte no MW Floorplan Studio.
- Geração automática dos elementos a partir da planta, no Floorplan Studio.

---

© 2026 MAYCON WILLIAN OLIVEIRA — MIT
