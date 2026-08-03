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

  class MwDoorWindowElement extends HTMLElement {
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

  if (!customElements.get("mw-door-window-element")) {
    customElements.define("mw-door-window-element", MwDoorWindowElement);
  }

  console.info(
    "%c MW-DOOR-WINDOW-ELEMENT %c 0.1.1 ",
    "color:#0b1021;background:#7fff00;font-weight:700",
    "color:#7fff00;background:#0b1021"
  );
})();
