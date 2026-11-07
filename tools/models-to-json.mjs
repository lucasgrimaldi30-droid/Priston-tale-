// Gera cópias glTF em JSON (buffers embutidos) dos modelos .glb.
// Usado para publicar onde arquivos .glb não são servidos (o jogo tenta .glb e depois .json).
// Uso: (cd tools && npm i @gltf-transform/core@4.1.1 @gltf-transform/extensions@4.1.1) && node tools/models-to-json.mjs [saida]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
import path from 'path';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const D = path.resolve('assets/models');
const O = path.resolve(process.argv[2] || 'build/models-json');
fs.mkdirSync(O, { recursive: true });
for (const f of fs.readdirSync(D).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(D, f));
  const { json, resources } = await io.writeJSON(doc, { format: 'json' });
  const uri = (k, mime) => 'data:' + mime + ';base64,' + Buffer.from(resources[k]).toString('base64');
  for (const b of json.buffers || []) if (b.uri && resources[b.uri]) b.uri = uri(b.uri, 'application/octet-stream');
  for (const im of json.images || []) if (im.uri && resources[im.uri]) im.uri = uri(im.uri, im.mimeType || 'image/png');
  fs.writeFileSync(path.join(O, f.replace('.glb', '.json')), JSON.stringify(json));
  console.log(f, '->', path.join(O, f.replace('.glb', '.json')));
}
