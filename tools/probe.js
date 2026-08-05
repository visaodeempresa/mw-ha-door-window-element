/* Probe headless — instancia o elemento fora do navegador e confere o que
 * some quando alguém mexe: cor por estado, brilho derivado, ícone de exceção,
 * geometria aplicada no host e o "unknown" de estado estranho.
 * Roda no CI e antes de qualquer push:  node tools/probe.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const mkStyle = () => {
  const s = {};
  s.setProperty = (k, v) => { s[k] = v; };
  return s;
};

global.HTMLElement = class {
  constructor() { this.style = mkStyle(); this._listeners = {}; this.children = []; }
  attachShadow() { this.shadowRoot = { innerHTML: "" }; return this.shadowRoot; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  appendChild(el) { this.children.push(el); return el; }
  querySelectorAll() { return []; }
  dispatchEvent() {}
};
const reg = {};
global.customElements = { define: (n, c) => (reg[n] = c), get: (n) => reg[n] };
global.window = {};
global.document = {
  createElement: () => ({
    style: { cssText: "" }, dataset: {},
    addEventListener() {}, appendChild() {}, dispatchEvent() {},
    querySelectorAll: () => [],
  }),
};
global.CustomEvent = class { constructor(t, d) { this.type = t; Object.assign(this, d); } };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
console.info = () => {};

eval(fs.readFileSync(
  path.join(__dirname, "..", "dist", "mw-door-window-element.js"), "utf8"));

const hass = {
  states: {
    "binary_sensor.porta_cozinha": {
      state: "on",
      attributes: { device_class: "door", friendly_name: "PORTA DA COZINHA" },
    },
    "binary_sensor.janela_quarto": {
      state: "off",
      attributes: { device_class: "window", friendly_name: "Janela do Quarto" },
    },
    "binary_sensor.sumida": { state: "unavailable", attributes: {} },
    "binary_sensor.esquisita": { state: "banana", attributes: {} },
    "cover.garagem": { state: "open", attributes: { device_class: "garage" } },
  },
  callService() {},
};

let fails = 0;
const check = (label, cond, extra = "") => {
  if (cond) { console.log(`  ok   ${label}`); return; }
  fails += 1;
  console.log(`  FAIL ${label}${extra ? " — " + extra : ""}`);
};

const make = (config) => {
  const el = new reg["mw-door-window-element"]();
  el.setConfig(config);
  el.hass = hass;
  return el;
};

console.log("elemento:");

const open = make({ entity: "binary_sensor.porta_cozinha" });
let html = open.shadowRoot.innerHTML;
check("aberta pinta verde", html.includes("background-color:rgba(127, 255, 0, 1)"), html);
check("brilho derivado com alfa 0.75",
  html.includes("box-shadow:0 0 20px 5px rgba(127, 255, 0, 0.75)"), html);
check("aberta não desenha ícone", !html.includes("<ha-icon"));
check("tooltip = friendly_name", open.title === "PORTA DA COZINHA");

const closed = make({ entity: "binary_sensor.janela_quarto" });
html = closed.shadowRoot.innerHTML;
check("fechada pinta laranja", html.includes("background-color:rgba(255, 69, 0, 1)"));
check("fechada sem ícone", !html.includes("<ha-icon"));

const gone = make({ entity: "binary_sensor.sumida" });
html = gone.shadowRoot.innerHTML;
check("indisponível usa mdi:cancel amarelo",
  html.includes('icon="mdi:cancel"') && html.includes("color:rgba(255, 255, 0, 1)"), html);

const weird = make({ entity: "binary_sensor.esquisita" });
check("estado fora das listas vira desconhecido",
  weird.shadowRoot.innerHTML.includes('icon="mdi:crosshairs-question"'));

const missing = make({ entity: "binary_sensor.nao_existe" });
check("entidade inexistente vira indisponível",
  missing.shadowRoot.innerHTML.includes('icon="mdi:cancel"'));

const cover = make({ entity: "cover.garagem" });
check("cover aberto conta como aberto",
  cover.shadowRoot.innerHTML.includes("background-color:rgba(127, 255, 0, 1)"));

const inv = make({ entity: "binary_sensor.porta_cozinha", invert: true });
check("invert:true troca aberta por fechada",
  inv.shadowRoot.innerHTML.includes("background-color:rgba(255, 69, 0, 1)"));

const geo = make({
  entity: "binary_sensor.porta_cozinha",
  left: "calc(100% - 72.4%)", top: "16.2%", length: "10%", thickness: "0.8%", rotate: 90,
});
check("geometria vai para o host",
  geo.style.left === "calc(100% - 72.4%)" && geo.style.top === "16.2%" &&
  geo.style.width === "10%" && geo.style.height === "0.8%",
  JSON.stringify(geo.style));
check("rotate compõe com o translate do picture-elements",
  geo.style.transform === "translate(-50%, -50%) rotate(90deg) scale(1)", geo.style.transform);

const noGeo = make({ entity: "binary_sensor.porta_cozinha" });
check("sem geometria na config, o host não é tocado (vale o `style:` do YAML)",
  noGeo.style.left === undefined && noGeo.style.transform === undefined);

const hex = make({ entity: "binary_sensor.porta_cozinha", color_open: "#33cc55" });
check("brilho derivado de #hex",
  hex.shadowRoot.innerHTML.includes("rgba(51, 204, 85, 0.75)"),
  hex.shadowRoot.innerHTML);

const noGlow = make({ entity: "binary_sensor.porta_cozinha", glow: false });
check("glow:false apaga o box-shadow", !noGlow.shadowRoot.innerHTML.includes("box-shadow"));

const hide = make({ entity: "binary_sensor.janela_quarto", hide_closed: true });
check("hide_closed some com a barra", hide.shadowRoot.innerHTML.includes("display:none"));

const still = make({ entity: "binary_sensor.porta_cozinha" });
still.shadowRoot.innerHTML = "TOCADO";
still.hass = hass;
check("mesmo estado não redesenha", still.shadowRoot.innerHTML === "TOCADO");
hass.states["binary_sensor.porta_cozinha"] = { state: "off", attributes: {} };
still.hass = hass;
check("estado novo redesenha", still.shadowRoot.innerHTML.includes("rgba(255, 69, 0, 1)"));
hass.states["binary_sensor.porta_cozinha"] = {
  state: "on", attributes: { device_class: "door", friendly_name: "PORTA DA COZINHA" } };

let threw = false;
try { new reg["mw-door-window-element"]().setConfig({}); } catch (e) { threw = true; }
check("setConfig sem entity falha", threw);

check("elemento entrega o editor",
  typeof reg["mw-door-window-element"].getConfigElement === "function");

console.log("editor:");

hass.entities = {
  "binary_sensor.porta_cozinha": { device_id: "dev1" },
  "binary_sensor.janela_quarto": { device_id: "dev2" },
  "cover.garagem": { device_id: "dev3" },
};
hass.devices = {
  dev1: { name: "Sensor da cozinha", area_id: "a1" },
  dev2: { name: "Sensor do quarto" },
  dev3: { name: "Motor da garagem" },
};
hass.areas = { a1: { name: "Cozinha" } };

const ed = new reg["mw-door-window-element-editor"]();
ed.hass = hass;
ed.setConfig({ entity: "binary_sensor.porta_cozinha", device: "dev1" });
const schema = ed._schema();
const byName = (n) => schema.find((f) => f.name === n);
check("select de dispositivo", !!byName("device") &&
  byName("device").selector.select.options.length === 3);
const entOpts = byName("entity").selector.select.options;
check("entidade filtrada pelo dispositivo",
  entOpts.length === 1 && entOpts[0].value === "binary_sensor.porta_cozinha",
  JSON.stringify(entOpts.map((o) => o.value)));
check("seções expansíveis presentes (geometria, aparência, ícones, esconder, ações)",
  schema.filter((f) => f.type === "expandable").length === 5);
check("expandable com name vazio (senão o ha-form aninha o data)",
  schema.filter((f) => f.type === "expandable").every((f) => f.name === ""));

const edAll = new reg["mw-door-window-element-editor"]();
edAll.hass = hass;
edAll.setConfig({ entity: "binary_sensor.porta_cozinha" });
check("sem dispositivo, lista todas as portas/janelas/covers",
  edAll._schema().find((f) => f.name === "entity").selector.select.options.length === 3);

// o editor não pode gravar default nenhum no YAML
const captured = [];
edAll.dispatchEvent = (ev) => captured.push(ev.detail.config);
edAll._onChange({
  stopPropagation() {},
  detail: {
    value: {
      entity: "binary_sensor.porta_cozinha", name: "", glow: true, glow_blur: 20,
      rotate: 90, thickness: "0.8%", icon_size: "4.2vh", left: null,
      tap_action: "more-info",
    },
  },
});
check("defaults fora do YAML", JSON.stringify(captured[0]) === JSON.stringify({
  entity: "binary_sensor.porta_cozinha", rotate: 90, thickness: "0.8%",
}), JSON.stringify(captured[0]));

// cor escolhida no bloco de baixo sobrevive a uma mexida no ha-form
const edColor = new reg["mw-door-window-element-editor"]();
edColor.hass = hass;
edColor.setConfig({ entity: "binary_sensor.porta_cozinha", color_open: "#33cc55" });
const got = [];
edColor.dispatchEvent = (ev) => got.push(ev.detail.config);
edColor._onChange({
  stopPropagation() {},
  detail: { value: { entity: "binary_sensor.porta_cozinha", rotate: 90 } },
});
check("cor do bloco de baixo não é perdida pelo ha-form", got[0].color_open === "#33cc55",
  JSON.stringify(got[0]));

// trocar de dispositivo não pode deixar a entidade do dispositivo velho
const edDev = new reg["mw-door-window-element-editor"]();
edDev.hass = hass;
edDev.setConfig({ entity: "binary_sensor.porta_cozinha", device: "dev1" });
const moved = [];
edDev.dispatchEvent = (ev) => moved.push(ev.detail.config);
edDev._onChange({
  stopPropagation() {},
  detail: { value: { device: "dev2", entity: "binary_sensor.porta_cozinha" } },
});
check("trocar de dispositivo troca a entidade",
  moved[0].entity === "binary_sensor.janela_quarto", JSON.stringify(moved[0]));

// ação em objeto (YAML do HA) não pode quebrar o dropdown de string
const edObj = new reg["mw-door-window-element-editor"]();
edObj.hass = hass;
edObj.setConfig({
  entity: "binary_sensor.porta_cozinha",
  tap_action: { action: "navigate", navigation_path: "/planta" },
});
check("ação em objeto vira string no formulário", edObj._form.data.tap_action === "navigate",
  JSON.stringify(edObj._form.data.tap_action));

console.log(fails ? `\n${fails} verificação(ões) falharam` : "\ntudo ok");
process.exit(fails ? 1 : 0);
