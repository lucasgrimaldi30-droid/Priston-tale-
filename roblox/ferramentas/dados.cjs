// Gera roblox/src/shared/Dados.lua a partir de js/data.js (classes, mapas, raridades, armas...).
// Uso: node roblox/ferramentas/dados.cjs
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '../..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '\n;this.__d = { CLASSES, FACTIONS, CLASS_LORE, ZONES: typeof ZONES !== "undefined" ? ZONES : null, RARITIES, WEAPON_NAMES, WEAPON_INFO, ARMOR_SLOTS, AFFIXES, SLOT_ORDER, TWO_HAND_MULT };', ctx);
const d = ctx.__d;
const key = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !['end', 'and', 'or', 'not', 'for', 'if', 'then', 'do', 'in', 'local', 'nil', 'true', 'false', 'function', 'repeat', 'until', 'while', 'return', 'break', 'else', 'elseif'].includes(k) ? k : `[${JSON.stringify(k)}]`);
const lua = (v, ind = '') => {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const n = ind + '\t';
  if (Array.isArray(v)) return v.length ? '{\n' + v.map((x) => n + lua(x, n)).join(',\n') + '\n' + ind + '}' : '{}';
  const es = Object.entries(v).filter(([, x]) => typeof x !== 'function');
  return es.length ? '{\n' + es.map(([k, x]) => `${n}${key(k)} = ${lua(x, n)}`).join(',\n') + '\n' + ind + '}' : '{}';
};
// ordem fixa das classes e dos mapas
const ordem = Object.keys(d.CLASSES);
let out = '-- GERADO por roblox/ferramentas/dados.cjs a partir de js/data.js. Não edite à mão.\nlocal D = {}\n';
out += `D.ORDEM_CLASSES = ${lua(ordem)}\n`;
for (const k of ['CLASSES', 'FACTIONS', 'CLASS_LORE', 'ZONES', 'RARITIES', 'WEAPON_NAMES', 'WEAPON_INFO', 'ARMOR_SLOTS', 'AFFIXES', 'SLOT_ORDER', 'TWO_HAND_MULT']) out += `D.${k} = ${lua(d[k])}\n`;
out += 'return D\n';
fs.writeFileSync(path.join(root, 'roblox/src/shared/Dados.lua'), out);
console.log('Dados.lua:', out.length, 'bytes; zonas', d.ZONES ? d.ZONES.length : 0);
