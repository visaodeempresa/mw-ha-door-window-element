/* mw-ha-door-window-element — custom:mw-door-window-element
 * Elemento de picture-elements: a barrinha que representa uma porta ou uma
 * janela na planta, pintada pelo estado (aberta / fechada / indisponível /
 * desconhecido) com brilho e ícone de exceção.
 * Substitui o bloco de 4 `conditional` + 4 `custom:button-card` por um
 * elemento só, sem perder nada do visual.
 * JS puro, arquivo único, sem build.
 * Repo: https://github.com/visaodeempresa/mw-ha-door-window-element
 * Releases automáticas: push na main → bump semântico → tag → HACS.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    // --- entidade ---
    device: "",                // só o editor usa: filtra a lista de entidades
    entity: "",
    name: "",                  // tooltip; vazio = friendly_name da entidade
    invert: false,             // sensor invertido (on = fechada)

    // --- geometria (opcional: dá para posicionar pelo `style:` do
    //     picture-elements; o que estiver aqui vence o `style:`) ---
    left: "",                  // ex.: "27.6%" ou "calc(100% - 72.4%)"
    top: "",                   // ex.: "16.2%"
    length: "",                // comprimento da barra  → width
    thickness: "",             // espessura da barra    → height
    rotate: null,              // graus (90 = vertical)
    scale: null,
    border_radius: "0%",

    // --- aparência ---
    opacity: 1,
    glow: true,
    glow_blur: 20,             // px
    glow_spread: 5,            // px
    glow_opacity: 0.75,        // alfa do brilho derivado da cor do estado

    // --- cores por estado ---
    color_open: "rgba(127, 255, 0, 1)",
    color_closed: "rgba(255, 69, 0, 1)",
    color_unavailable: "rgba(255, 99, 71, 0.7)",
    color_unknown: "rgba(255, 99, 71, 0.7)",
    // vazio = derivado da cor do estado com `glow_opacity`
    color_open_glow: "",
    color_closed_glow: "",
    color_unavailable_glow: "",
    color_unknown_glow: "",

    // --- ícones (vazio = barra limpa, sem ícone) ---
    icon_open: "",
    icon_closed: "",
    icon_unavailable: "mdi:cancel",
    icon_unknown: "mdi:crosshairs-question",
    color_icon_open: "rgba(50, 205, 50, 1)",
    color_icon_closed: "rgba(178, 34, 34, 1)",
    color_icon_unavailable: "rgba(255, 255, 0, 1)",
    color_icon_unknown: "rgba(255, 255, 255, 0.8)",
    icon_size: "4.2vh",
    icon_scale: 0.85,
    icon_offset_y: "5%",
    icon_upright: false,       // true = desfaz o `rotate` só no ícone

    // --- visibilidade por estado ---
    hide_open: false,
    hide_closed: false,
    hide_unavailable: false,
    hide_unknown: false,

    // --- ações ---
    tap_action: "more-info",   // string ou objeto ({action: ...})
    hold_action: "none",
    double_tap_action: "none",
    navigation_path: "",
    url_path: "",
    service: "",
    service_data: null,
  };

  const OPEN_STATES = new Set(["on", "open", "opening", "detected", "unlocked"]);
  const CLOSED_STATES = new Set(["off", "closed", "closing", "clear", "locked"]);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const px = (v) => (v === null || v === undefined || v === "" ? "0"
    : typeof v === "number" || /^-?[\d.]+$/.test(String(v)) ? `${v}px` : String(v));

  // aberto / fechado / indisponível / desconhecido — serve para binary_sensor,
  // cover e lock; qualquer estado fora das listas cai em "unknown"
  const resolveMode = (raw, invert) => {
    if (raw === undefined || raw === null || raw === "unavailable") return "unavailable";
    if (raw === "unknown" || raw === "") return "unknown";
    let open = OPEN_STATES.has(raw) ? true : CLOSED_STATES.has(raw) ? false : null;
    if (open === null) return "unknown";
    if (invert) open = !open;
    return open ? "open" : "closed";
  };

  // brilho = a própria cor do estado com outro alfa (rgb/rgba/#hex);
  // cor nomeada ou var(--...) sai inteira, sem transparência
  const withAlpha = (color, alpha) => {
    const c = String(color || "").trim();
    let m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(",").map((s) => s.trim());
      if (p.length >= 3) return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`;
    }
    m = c.match(/^#([0-9a-fA-F]{3,8})$/);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
      const n = parseInt(h.slice(0, 6), 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    return c;
  };

  const fire = (node, type, detail) => {
    const ev = new CustomEvent(type, { detail, bubbles: true, composed: true });
    node.dispatchEvent(ev);
    return ev;
  };

  /* ------- descoberta de portas/janelas (usada só pelo editor) ------- */

  const DW_CLASSES = ["door", "window", "garage_door", "opening", "garage"];

  const isDoorWindow = (hass, id) =>
    (id.startsWith("binary_sensor.") || id.startsWith("cover.") || id.startsWith("lock.")) &&
    (id.startsWith("lock.") ||
      DW_CLASSES.includes(hass.states[id]?.attributes?.device_class));

  const friendly = (hass, id) => hass.states[id]?.attributes?.friendly_name || id;

  const deviceOf = (hass, id) => hass?.entities?.[id]?.device_id || "";

  const deviceName = (hass, devId) => {
    const d = hass?.devices?.[devId];
    if (!d) return devId;
    const area = d.area_id && hass.areas?.[d.area_id]?.name;
    return (d.name_by_user || d.name || devId) + (area ? ` · ${area}` : "");
  };

  // dispositivos que têm ao menos uma porta/janela
  const doorWindowDevices = (hass) => {
    if (!hass?.entities || !hass?.devices) return [];
    const ids = new Set();
    for (const id of Object.keys(hass.states)) {
      if (!isDoorWindow(hass, id)) continue;
      const d = deviceOf(hass, id);
      if (d) ids.add(d);
    }
    return [...ids]
      .map((d) => ({ value: d, label: deviceName(hass, d) }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  };

  // do dispositivo escolhido; sem dispositivo, todas; sem nenhuma
  // (integração exótica), cai para todos os binary_sensor
  const doorWindowEntities = (hass, devId) => {
    const all = Object.keys(hass.states).filter((id) => isDoorWindow(hass, id));
    let list = all;
    if (devId) {
      const own = all.filter((id) => deviceOf(hass, id) === devId);
      if (own.length) list = own;
    }
    if (!list.length) {
      list = Object.keys(hass.states).filter((id) => id.startsWith("binary_sensor."));
    }
    return list
      .map((id) => ({ value: id, label: `${friendly(hass, id)} (${id})` }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  };

  class MwDoorWindowElement extends HTMLElement {
    static getConfigElement() {
      return document.createElement("mw-door-window-element-editor");
    }

    static getStubConfig() {
      return { entity: "", left: "50%", top: "50%", length: "10%", thickness: "0.8%" };
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._sig = null;
      this._holdFired = false;
      this.addEventListener("click", (e) => {
        if (this._holdFired) { this._holdFired = false; return; }
        e.stopPropagation();
        this._run(this._config && this._config.tap_action);
      });
      this.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this._run(this._config && this._config.double_tap_action);
      });
      this.addEventListener("pointerdown", () => {
        this._holdTimer = setTimeout(() => {
          this._holdFired = true;
          this._run(this._config && this._config.hold_action);
        }, 500);
      });
      const cancel = () => clearTimeout(this._holdTimer);
      this.addEventListener("pointerup", cancel);
      this.addEventListener("pointercancel", cancel);
      this.addEventListener("pointerleave", cancel);
    }

    setConfig(config) {
      if (!config || !config.entity) {
        throw new Error("mw-door-window-element: informe 'entity'");
      }
      this._config = { ...DEFAULTS, ...config };
      this._sig = null;
      this._applyGeometry();
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    get hass() { return this._hass; }

    // o picture-elements aplica o `style:` do YAML no host logo depois de
    // criar o elemento; o que vier na config vence, e o que não vier não é
    // tocado — assim dá para posicionar dos dois jeitos
    _applyGeometry() {
      const c = this._config;
      const set = (prop, val) => {
        if (val === "" || val === null || val === undefined) return;
        this.style.setProperty(prop, String(val));
      };
      set("left", c.left);
      set("top", c.top);
      set("width", c.length);
      set("height", c.thickness);
      if (c.rotate !== null && c.rotate !== "" || c.scale !== null && c.scale !== "") {
        const r = c.rotate === null || c.rotate === "" ? 0 : c.rotate;
        const s = c.scale === null || c.scale === "" ? 1 : c.scale;
        set("transform", `translate(-50%, -50%) rotate(${r}deg) scale(${s})`);
      }
    }

    _run(spec) {
      const cfg = this._config;
      if (!cfg || !this._hass) return;
      const a = typeof spec === "string" ? { action: spec } : (spec || { action: "none" });
      switch (a.action) {
        case "none":
          return;
        case "toggle":
          this._hass.callService("homeassistant", "toggle",
            { entity_id: a.entity_id || cfg.entity });
          return;
        case "call-service":
        case "perform-action": {
          const svc = a.perform_action || a.service || cfg.service;
          if (!svc || svc.indexOf(".") < 0) return;
          const [dom, srv] = svc.split(".");
          this._hass.callService(dom, srv,
            a.data || a.service_data || cfg.service_data || {}, a.target);
          return;
        }
        case "navigate": {
          const path = a.navigation_path || cfg.navigation_path;
          if (!path) return;
          history.pushState(null, "", path);
          fire(window, "location-changed", { replace: false });
          return;
        }
        case "url": {
          const url = a.url_path || cfg.url_path;
          if (url) window.open(url, a.new_tab === false ? "_self" : "_blank");
          return;
        }
        default:
          fire(this, "hass-more-info", { entityId: a.entity || cfg.entity });
      }
    }

    _render() {
      const cfg = this._config;
      const hass = this._hass;
      if (!cfg || !hass) return;

      const st = hass.states[cfg.entity];
      const mode = resolveMode(st && st.state, cfg.invert);
      const sig = `${mode}|${st ? st.state : "-"}`;
      if (sig === this._sig) return;
      this._sig = sig;

      const hidden = !!cfg[`hide_${mode}`];
      const bg = cfg[`color_${mode}`];
      const glowColor = cfg[`color_${mode}_glow`] || withAlpha(bg, cfg.glow_opacity);
      const icon = cfg[`icon_${mode}`];
      const iconColor = cfg[`color_icon_${mode}`];
      const glow = cfg.glow
        ? `box-shadow:0 0 ${px(cfg.glow_blur)} ${px(cfg.glow_spread)} ${glowColor};` : "";
      const upright = cfg.icon_upright && cfg.rotate ? ` rotate(${-cfg.rotate}deg)` : "";
      const clickable = String((typeof cfg.tap_action === "string"
        ? cfg.tap_action : (cfg.tap_action || {}).action)) !== "none";

      this.title = cfg.name || (st && st.attributes && st.attributes.friendly_name) || cfg.entity;

      this.shadowRoot.innerHTML = `
<style>
  :host{display:${hidden ? "none" : "block"};box-sizing:border-box;overflow:visible;
        cursor:${clickable ? "pointer" : "default"};}
  .bar{position:absolute;inset:0;border-radius:${cfg.border_radius};
       background-color:${bg};opacity:${cfg.opacity};${glow}}
  .ico{position:absolute;left:50%;top:50%;--mdc-icon-size:${cfg.icon_size};
       color:${iconColor};pointer-events:none;
       transform:translate(-50%,-50%) translateY(${cfg.icon_offset_y}) scale(${cfg.icon_scale})${upright};}
</style>
<div class="bar"></div>
${icon ? `<ha-icon class="ico" icon="${esc(icon)}"></ha-icon>` : ""}`;
    }
  }

  /* ------------------------------ EDITOR ------------------------------ */

  const LABELS = {
    device: "Dispositivo (filtra a lista abaixo)",
    entity: "Entidade (porta, janela, cover ou fechadura)",
    name: "Nome (tooltip; vazio = nome da entidade)",
    invert: "Sensor invertido (on = fechada)",
    left: "Esquerda (ex.: 27.6% ou calc(100% - 72.4%))",
    top: "Topo (ex.: 16.2%)",
    length: "Comprimento da barra (ex.: 10%)",
    thickness: "Espessura da barra (ex.: 0.8%)",
    rotate: "Rotação",
    scale: "Escala",
    border_radius: "Cantos (ex.: 0% ou 40%)",
    opacity: "Opacidade da barra",
    glow: "Brilho ao redor",
    glow_blur: "Brilho — desfoque",
    glow_spread: "Brilho — espalhamento",
    glow_opacity: "Brilho — transparência",
    icon_open: "Ícone quando aberta (vazio = barra limpa)",
    icon_closed: "Ícone quando fechada (vazio = barra limpa)",
    icon_unavailable: "Ícone quando indisponível",
    icon_unknown: "Ícone quando desconhecido",
    icon_size: "Tamanho do ícone (ex.: 4.2vh)",
    icon_scale: "Escala do ícone",
    icon_offset_y: "Deslocamento vertical do ícone",
    icon_upright: "Ícone de pé (desfaz a rotação)",
    hide_open: "Esconder quando aberta",
    hide_closed: "Esconder quando fechada",
    hide_unavailable: "Esconder quando indisponível",
    hide_unknown: "Esconder quando desconhecido",
    tap_action: "Toque",
    hold_action: "Toque longo",
    double_tap_action: "Toque duplo",
    navigation_path: "Tela (para 'Navegar')",
    url_path: "Link (para 'Abrir um link')",
    color_open: "Aberta",
    color_closed: "Fechada",
    color_unavailable: "Indisponível",
    color_unknown: "Desconhecido",
    color_icon_open: "Ícone — aberta",
    color_icon_closed: "Ícone — fechada",
    color_icon_unavailable: "Ícone — indisponível",
    color_icon_unknown: "Ícone — desconhecido",
  };

  // o brilho de cada estado é derivado da cor: fica fora do bloco de cores
  // (quem quiser fixar usa `color_<estado>_glow` no YAML)
  const COLOR_FIELDS = ["color_open", "color_closed", "color_unavailable", "color_unknown",
    "color_icon_open", "color_icon_closed", "color_icon_unavailable", "color_icon_unknown"];

  const ACTIONS = [
    { value: "more-info", label: "Abrir detalhes (more-info)" },
    { value: "toggle", label: "Alternar a entidade" },
    { value: "navigate", label: "Navegar para uma tela" },
    { value: "url", label: "Abrir um link" },
    { value: "none", label: "Nada" },
  ];

  const parseColor = (str) => {
    const s = String(str || "").trim();
    let m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
    m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) { const [r, g, b] = m[1].split("").map((x) => parseInt(x + x, 16)); return { r, g, b, a: 1 }; }
    return { r: 128, g: 128, b: 128, a: 1 };
  };
  const toHex = ({ r, g, b }) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const toRgba = ({ r, g, b, a }) => `rgba(${r}, ${g}, ${b}, ${a})`;

  class MwDoorWindowElementEditor extends HTMLElement {
    setConfig(config) { this._config = { ...config }; this._renderForm(); }

    set hass(hass) {
      this._hass = hass;
      if (this._form) { this._form.hass = hass; this._form.schema = this._schema(); }
    }

    _schema() {
      const hass = this._hass;
      const cfg = this._config || {};
      const num = (min, max, step, unit) =>
        ({ number: { min, max, step, mode: "box", ...(unit ? { unit_of_measurement: unit } : {}) } });
      if (!hass) return [{ name: "entity", required: true, selector: { entity: {} } }];

      const devices = doorWindowDevices(hass);
      const entities = doorWindowEntities(hass, cfg.device);

      return [
        // dispositivo primeiro: escolher a porta filtra a entidade
        ...(devices.length
          ? [{ name: "device", selector: { select: { mode: "dropdown", options: devices } } }]
          : []),
        { name: "entity", required: true, selector: { select: { mode: "dropdown", options: entities } } },
        { name: "name", selector: { text: {} } },
        { name: "invert", selector: { boolean: {} } },
        {
          name: "", type: "expandable", title: "Geometria na planta", schema: [
            { name: "left", selector: { text: {} } },
            { name: "top", selector: { text: {} } },
            { name: "length", selector: { text: {} } },
            { name: "thickness", selector: { text: {} } },
            { name: "rotate", selector: num(-180, 360, 1, "°") },
            { name: "scale", selector: num(0.1, 5, 0.05) },
            { name: "border_radius", selector: { text: {} } },
          ],
        },
        {
          name: "", type: "expandable", title: "Aparência", schema: [
            { name: "glow", selector: { boolean: {} } },
            { name: "glow_blur", selector: num(0, 80, 1, "px") },
            { name: "glow_spread", selector: num(0, 40, 1, "px") },
            { name: "glow_opacity", selector: num(0, 1, 0.05) },
            { name: "opacity", selector: num(0, 1, 0.05) },
          ],
        },
        {
          name: "", type: "expandable", title: "Ícones", schema: [
            { name: "icon_open", selector: { icon: {} } },
            { name: "icon_closed", selector: { icon: {} } },
            { name: "icon_unavailable", selector: { icon: {} } },
            { name: "icon_unknown", selector: { icon: {} } },
            { name: "icon_size", selector: { text: {} } },
            { name: "icon_scale", selector: num(0.1, 3, 0.05) },
            { name: "icon_offset_y", selector: { text: {} } },
            { name: "icon_upright", selector: { boolean: {} } },
          ],
        },
        {
          name: "", type: "expandable", title: "Esconder por estado", schema: [
            { name: "hide_open", selector: { boolean: {} } },
            { name: "hide_closed", selector: { boolean: {} } },
            { name: "hide_unavailable", selector: { boolean: {} } },
            { name: "hide_unknown", selector: { boolean: {} } },
          ],
        },
        {
          name: "", type: "expandable", title: "Ações", schema: [
            { name: "tap_action", selector: { select: { mode: "dropdown", options: ACTIONS } } },
            { name: "hold_action", selector: { select: { mode: "dropdown", options: ACTIONS } } },
            { name: "double_tap_action", selector: { select: { mode: "dropdown", options: ACTIONS } } },
            { name: "navigation_path", selector: { text: {} } },
            { name: "url_path", selector: { text: {} } },
          ],
        },
      ];
    }

    _renderForm() {
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (f) => LABELS[f.name] || f.name;
        this._form.addEventListener("value-changed", (ev) => this._onChange(ev));
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = this._schema();
      // campo vazio (ex.: posição ainda não escolhida) não vai para o ha-form:
      // o seletor mostra lixo em vez de caixa vazia
      const data = { ...DEFAULTS, ...this._config };
      for (const k of Object.keys(data)) if (data[k] === "" || data[k] === null) delete data[k];
      // ação em objeto ({action: navigate}) não cabe no dropdown de string
      for (const k of ["tap_action", "hold_action", "double_tap_action"]) {
        if (data[k] && typeof data[k] === "object") data[k] = data[k].action;
      }
      this._form.data = data;
      this._renderColors();
    }

    _renderColors() {
      if (!this._colorsEl) {
        this._colorsEl = document.createElement("details");
        this._colorsEl.style.cssText =
          "margin-top:16px;border:1px solid var(--divider-color);border-radius:8px;padding:8px 12px;";
        this.appendChild(this._colorsEl);
      }
      const rows = COLOR_FIELDS.map((name) => {
        const cur = this._config[name] ?? DEFAULTS[name] ?? "";
        const c = parseColor(cur || "rgba(128,128,128,1)");
        return `<div class="dwe-crow" data-name="${name}">
          <span class="lbl">${LABELS[name] || name}</span>
          <input type="color" value="${toHex(c)}" title="cor">
          <input type="range" min="0" max="1" step="0.01" value="${c.a}" title="transparência (alfa)">
          <code>${cur || "—"}</code>
        </div>`;
      }).join("");
      this._colorsEl.innerHTML = `
        <summary style="cursor:pointer;font-weight:500;">Cores (clique para ajustar — cor + transparência)</summary>
        <style>
          .dwe-crow{display:grid;grid-template-columns:1fr 44px 110px minmax(120px,1fr);gap:10px;
            align-items:center;padding:6px 0;}
          .dwe-crow .lbl{font-size:13px;}
          .dwe-crow input[type=color]{width:40px;height:28px;border:none;background:none;cursor:pointer;padding:0;}
          .dwe-crow code{font-size:11px;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        </style>${rows}`;
      this._colorsEl.querySelectorAll(".dwe-crow").forEach((rowEl) => {
        const name = rowEl.dataset.name;
        const apply = () => {
          const hex = rowEl.querySelector("input[type=color]").value;
          const a = parseFloat(rowEl.querySelector("input[type=range]").value);
          const { r, g, b } = parseColor(hex);
          const value = a >= 1 ? hex : toRgba({ r, g, b, a });
          const clean = { ...this._config };
          if (value === DEFAULTS[name]) delete clean[name]; else clean[name] = value;
          this._config = clean;
          rowEl.querySelector("code").textContent = clean[name] || "—";
          this.dispatchEvent(new CustomEvent("config-changed",
            { bubbles: true, composed: true, detail: { config: clean } }));
        };
        rowEl.querySelector("input[type=color]").addEventListener("input", apply);
        rowEl.querySelector("input[type=range]").addEventListener("input", apply);
      });
    }

    _onChange(ev) {
      ev.stopPropagation();
      const v = { ...ev.detail.value };
      const clean = {};
      for (const [k, val] of Object.entries(v)) {
        // campo limpo volta ao default em vez de gravar `chave: null` no YAML
        if (val === undefined || val === null || val === "") continue;
        if (k === "entity" || k === "device" || val !== DEFAULTS[k]) clean[k] = val;
      }
      // trocar de dispositivo invalida a entidade do dispositivo antigo
      if (clean.device && clean.device !== this._config.device) {
        if (clean.entity && deviceOf(this._hass, clean.entity) !== clean.device) delete clean.entity;
        if (!clean.entity) {
          const first = doorWindowEntities(this._hass, clean.device)[0];
          if (first) clean.entity = first.value;
        }
      }
      // as cores vivem no bloco de baixo, fora do ha-form
      for (const k of COLOR_FIELDS) {
        if (this._config[k] !== undefined) clean[k] = this._config[k];
      }
      this._config = clean;
      this.dispatchEvent(new CustomEvent("config-changed",
        { bubbles: true, composed: true, detail: { config: clean } }));
      this._renderForm();
    }
  }

  if (!customElements.get("mw-door-window-element")) {
    customElements.define("mw-door-window-element", MwDoorWindowElement);
    customElements.define("mw-door-window-element-editor", MwDoorWindowElementEditor);
  }

  console.info(
    "%c MW-DOOR-WINDOW-ELEMENT %c 0.2.0 ",
    "color:#0b1021;background:#7fff00;font-weight:700",
    "color:#7fff00;background:#0b1021"
  );
})();
