// Safe GLSL minifier for /*glsl*/`...` template literals.
// Rules (each one exists because a naive regex broke real shaders):
//  - preprocessor lines (#define/#if/#include...) are kept verbatim on their own line;
//    `#define F (1.0/3.0)` must keep the space or it becomes a function-like macro.
//  - spaces are only removed next to { } ( ) [ ] ; , — never between two operator chars,
//    so `a - -b` never becomes `a--b`.
//  - ${...} interpolations are left untouched (we only process the static string pieces); a preprocessor line that
//    contains one is copied verbatim (`#define N ${n}` keeps its spaces), and space next to one survives as one space.
import { readFileSync } from 'node:fs';

export function minGlsl(src) {
  const out = [];
  let buf = '';
  const flush = () => {
    if (!buf) return;
    out.push(buf.replace(/[ \t]+/g, ' ').replace(/ ?([{}()\[\];,]) ?/g, '$1').trim());
    buf = '';
  };
  const noBlock = src.replace(/\/\*[^]*?\*\//g, ' ');
  for (let line of noBlock.split('\n')) {
    line = line.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line[0] === '#') { flush(); out.push(line.replace(/[ \t]+/g, ' ')); continue; }
    buf += (buf ? ' ' : '') + line;
  }
  flush();
  return out.join('\n');
}

// Minify only the literal text segments of a template, preserving ${expr} pieces.
// Seams matter: a preprocessor line that runs into an interpolation (`#define N ${n}`, `#define K ${a} * 2.0`) is
// copied VERBATIM up to its newline (spacing intact, never joined with the next statement), and whitespace next to
// an interpolation on an ordinary line survives as one space (`vec3 ${name} = ...` must not become `vec3${name}=`).
export function minTemplate(body) {
  const parts = [];
  let i = 0, depth = 0, start = 0;
  while (i < body.length) {
    if (body[i] === '\\') { i += 2; continue; }
    if (depth === 0 && body[i] === '$' && body[i + 1] === '{') {
      parts.push({ t: 'text', s: body.slice(start, i) }); depth = 1; start = i; i += 2; continue;
    }
    if (depth > 0) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}' && --depth === 0) { parts.push({ t: 'expr', s: body.slice(start, i + 1) }); start = i + 1; }
    }
    i++;
  }
  parts.push({ t: 'text', s: body.slice(start) });

  let out = '', inPP = false; // inPP: the line currently being written is a preprocessor line (copied verbatim)
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (p.t === 'expr') { out += p.s; continue; }
    let s = p.s;
    const hasNext = k < parts.length - 1;
    if (inPP) { // finish the preprocessor line verbatim, up to (and including) its newline
      const nl = s.indexOf('\n');
      if (nl < 0) { out += s; continue; }       // still on the same line: the next interpolation continues it
      out += s.slice(0, nl).replace(/[ \t]+$/, '') + '\n';
      s = s.slice(nl + 1); inPP = false;
      if (!s.trim()) { continue; }
    }
    // the last line of this piece runs into the next interpolation: is it a preprocessor line?
    const lastNl = s.lastIndexOf('\n');
    const tail = s.slice(lastNl + 1);
    const tailAtLineStart = lastNl >= 0 || k === 0 || /\n$/.test(out);
    if (hasNext && tailAtLineStart && tail.trimStart()[0] === '#') {
      const head = lastNl >= 0 ? s.slice(0, lastNl + 1) : '';
      const mh = minGlsl(head);
      if (/^\s*\n/.test(head) && out && !/\n$/.test(out)) out += '\n';
      if (mh) out += mh + '\n';
      else if (out && !/\n$/.test(out)) out += '\n';
      out += tail.trimStart();                   // verbatim, trailing space before the interpolation kept
      inPP = true;
      continue;
    }
    // ordinary text: newline seams stay newlines (the expr may be a #define block); space seams stay one space
    const m = minGlsl(s);
    const lead = /^\s*\n/.test(s) ? '\n' : (k > 0 && /^[ \t]/.test(s) && m ? ' ' : '');
    const trail = /\n\s*$/.test(s) ? '\n' : (hasNext && /[ \t]$/.test(s) && m ? ' ' : '');
    out += lead + m + trail;
  }
  return out;
}

export function minifySource(src) {
  return src.replace(/\/\*glsl\*\/\s*`((?:\\[^]|[^`\\])*)`/g, (_, body) => '`' + minTemplate(body) + '`');
}

export function glslMinifyPlugin() {
  return {
    name: 'glsl-min',
    setup(b) {
      b.onLoad({ filter: /\.(m?js)$/ }, (a) => {
        if (a.path.includes('node_modules')) return undefined;
        return { contents: minifySource(readFileSync(a.path, 'utf8')), loader: 'js' };
      });
    },
  };
}

// self-test: node glsl-min.mjs --test
if (process.argv[1] && process.argv[1].endsWith('glsl-min.mjs') && process.argv.includes('--test')) {
  const cases = [
    ['#define INV3 (1.0/3.0)\nfloat x = INV3;', (o) => o.includes('#define INV3 (1.0/3.0)')],
    ['float y = a - -b;', (o) => o.includes('a - -b')],
    ['float z = a + +b; // c\n/* block */ vec3 v = vec3( 1.0 , 2.0 );', (o) => o.includes('a + +b') && o.includes('vec3(1.0,2.0)') && !o.includes('block')],
    ['#ifdef X\n  float q;\n#endif\nvoid main() {\n  gl_FragColor = vec4( 1.0 );\n}', (o) => /\n#endif\n/.test('\n' + o + '\n') && o.includes('void main(){gl_FragColor=vec4(1.0);}') === false && o.includes('vec4(1.0)')],
  ];
  let ok = true;
  for (const [src, check] of cases) { const o = minGlsl(src); if (!check(o)) { ok = false; console.log('FAIL\n' + src + '\n→\n' + o); } }
  const t = minTemplate('\n#define N ${n}\nfloat a = 1.0 ;\n${chunk}\nvoid main(){ }');
  if (!t.includes('${n}') || !t.includes('${chunk}')) { ok = false; console.log('FAIL interp', t); }
  // regression: a preprocessor line running into an interpolation keeps its spacing verbatim (was '#define N${n}')
  const tcases = [
    ['\n#define N ${n}\nfloat a = 1.0 ;\n${chunk}\nvoid main(){ }', (o) => /(^|\n)#define N \$\{n\}\n/.test(o) && o.includes('float a = 1.0;')],
    ['#define N ${n}\nfloat a;', (o) => o.startsWith('#define N ${n}\n')],
    ['float b = 2.0;\n  #define K ${a} * 2.0\nfloat c = K;', (o) => o.includes('\n#define K ${a} * 2.0\nfloat c = K;') && o.startsWith('float b = 2.0;\n')],
    ['#if ${q} > 1\nfloat d;\n#endif', (o) => o.startsWith('#if ${q} > 1\n') && /\n#endif$/.test(o)],
    ['#define PAIR(a, b) ${x}  +  ${y}\nvoid main() {}', (o) => o.startsWith('#define PAIR(a, b) ${x}  +  ${y}\n')],
    ['vec3 ${name} = vec3( 1.0 );', (o) => o.includes('vec3 ${name} =') || o.includes('vec3 ${name}=')],
    ['float e = ${v} - -1.0;', (o) => o.includes('${v} - -1.0')],
  ];
  for (const [src, check] of tcases) { const o = minTemplate(src); if (!check(o)) { ok = false; console.log('FAIL template\n' + src + '\n→\n' + o); } }
  // end-to-end: minifySource on a JS file with a tagged template
  const js = 'const s = /*glsl*/`\n#define COUNT ${n}\nuniform float u[COUNT];\n`;';
  const mjs = minifySource(js);
  if (!mjs.includes('#define COUNT ${n}\n')) { ok = false; console.log('FAIL minifySource', mjs); }
  console.log(ok ? 'glsl-min: all tests pass' : 'glsl-min: FAILURES'); process.exit(ok ? 0 : 1);
}
