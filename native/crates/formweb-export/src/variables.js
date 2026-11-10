(() => {
  'use strict';
  let config = {};
  try { config = JSON.parse(document.getElementById('fw-config')?.textContent || '{}'); } catch {}
  const spec = config.variables;
  if (!spec || typeof spec !== 'object') return;
  const doc = document, html = doc.documentElement;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const obj = m => (m && typeof m === 'object' && !Array.isArray(m) ? m : {});
  const entries = m => Object.entries(obj(m));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const defs = obj(spec.values), tables = obj(spec.tables), sources = obj(spec.formulas);
  const nodes = id => [...doc.querySelectorAll(`[data-fw-node="${CSS.escape(String(id))}"]`)];
  const ready = fn => { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); };
  const guard = fn => { try { fn(); } catch {} };

  const fin = x => (Number.isFinite(x) ? x + 0 : 0);
  const DECIMAL = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
  const toNum = v => {
    if (typeof v === 'number') return fin(v);
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v !== 'string') return 0;
    const s = v.trim();
    return DECIMAL.test(s) ? fin(parseFloat(s)) : 0;
  };
  const numText = x => {
    x = fin(x);
    if (Number.isInteger(x)) return Math.abs(x) < 1e21 ? x.toFixed(0) : BigInt(x).toString();
    const s = x.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  };
  const toText = v => (typeof v === 'string' ? v : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? numText(v) : '');
  const truthy = v => (typeof v === 'string' ? v.length > 0 : typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : false);
  const coerce = (type, v) => {
    if (type === 'number') return toNum(v);
    if (type === 'boolean') return truthy(v);
    return toText(v);
  };
  const roundTo = (x, digits) => {
    const p = Math.pow(10, clamp(Math.trunc(fin(digits)), 0, 10));
    return fin(Math.sign(x) * Math.floor(Math.abs(x) * p + 0.5) / p);
  };
  const fixed = (x, d) => {
    if (x < 1e21) return x.toFixed(d);
    return BigInt(x).toString() + (d ? '.' + '0'.repeat(d) : '');
  };
  const format = (x, o) => {
    const d = clamp(Math.trunc(Number(o.decimals) || 0), 0, 10);
    const r = roundTo(fin(x), d);
    const parts = fixed(Math.abs(r), d).split('.');
    if (o.grouping) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${typeof o.prefix === 'string' ? o.prefix : ''}${r < 0 ? '-' : ''}${parts.join('.')}${typeof o.suffix === 'string' ? o.suffix : ''}`;
  };
  const cmpText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const TOKEN_NUM = /\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const TOKEN_NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
  const TOKEN_STR = /"[^"\\]*"/y;
  const TOKEN_OP = /\|\||&&|==|!=|<=|>=|[<>+\-*\/%^!(),]/y;
  const TOKEN_SPACE = /\s+/y;
  const lex = src => {
    const out = [];
    let i = 0;
    const at = (re) => { re.lastIndex = i; return re.exec(src); };
    while (i < src.length) {
      let m = at(TOKEN_SPACE);
      if (m) { i += m[0].length; continue; }
      if ((m = at(TOKEN_NUM))) out.push({ k: 'num', v: parseFloat(m[0]) });
      else if ((m = at(TOKEN_NAME))) out.push({ k: 'id', v: m[0] });
      else if ((m = at(TOKEN_STR))) out.push({ k: 'str', v: m[0].slice(1, -1) });
      else if ((m = at(TOKEN_OP))) out.push({ k: 'op', v: m[0] });
      else throw new Error('token');
      i += m[0].length;
    }
    return out;
  };

  const FUNCTIONS = new Set(['min', 'max', 'round', 'floor', 'ceil', 'abs', 'clamp', 'sum', 'lookup', 'if']);
  const parseFormula = src => {
    const t = lex(src);
    let p = 0;
    const isOp = v => p < t.length && t[p].k === 'op' && t[p].v === v;
    const eat = v => { if (!isOp(v)) throw new Error('expected'); p++; };
    const expr = () => or();
    const or = () => {
      let a = and();
      while (isOp('||')) { p++; a = { t: 'bin', o: '||', a, b: and() }; }
      return a;
    };
    const and = () => {
      let a = cmp();
      while (isOp('&&')) { p++; a = { t: 'bin', o: '&&', a, b: cmp() }; }
      return a;
    };
    const cmp = () => {
      const a = add();
      for (const o of ['==', '!=', '<=', '>=', '<', '>']) if (isOp(o)) { p++; return { t: 'bin', o, a, b: add() }; }
      return a;
    };
    const add = () => {
      let a = mul();
      while (isOp('+') || isOp('-')) { const o = t[p++].v; a = { t: 'bin', o, a, b: mul() }; }
      return a;
    };
    const mul = () => {
      let a = unary();
      while (isOp('*') || isOp('/') || isOp('%')) { const o = t[p++].v; a = { t: 'bin', o, a, b: unary() }; }
      return a;
    };
    const unary = () => {
      if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
      if (isOp('!')) { p++; return { t: 'not', a: unary() }; }
      return pow();
    };
    const pow = () => {
      const a = atom();
      if (isOp('^')) { p++; return { t: 'bin', o: '^', a, b: unary() }; }
      return a;
    };
    const atom = () => {
      const tok = t[p++];
      if (!tok) throw new Error('end');
      if (tok.k === 'num') return { t: 'lit', v: tok.v };
      if (tok.k === 'str') return { t: 'lit', v: tok.v };
      if (tok.k === 'op' && tok.v === '(') { const e = expr(); eat(')'); return e; }
      if (tok.k !== 'id') throw new Error('atom');
      if (tok.v === 'true') return { t: 'lit', v: true };
      if (tok.v === 'false') return { t: 'lit', v: false };
      if (isOp('(')) {
        if (!FUNCTIONS.has(tok.v)) throw new Error('function');
        p++;
        const args = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
        eat(')');
        return { t: 'call', f: tok.v, args };
      }
      return own(tables, tok.v) ? { t: 'tbl', v: tok.v } : { t: 'var', v: tok.v };
    };
    const root = expr();
    if (p !== t.length) throw new Error('trailing');
    return root;
  };
  const compile = src => { try { return parseFormula(String(src)); } catch { return null; } };

  const vals = {}, types = {}, res = {};
  for (const [name, def] of entries(defs)) {
    const type = def && (def.type === 'number' || def.type === 'boolean') ? def.type : 'text';
    types[name] = type;
    vals[name] = coerce(type, def && def.initial);
  }
  const lookupName = name => (own(vals, name) ? vals[name] : own(res, name) ? res[name] : 0);

  const evaluate = n => {
    switch (n.t) {
      case 'lit': return n.v;
      case 'var': return lookupName(n.v);
      case 'tbl': return 0;
      case 'neg': return fin(-toNum(evaluate(n.a)));
      case 'not': return !truthy(evaluate(n.a));
      case 'bin': return binary(n);
      case 'call': return call(n);
    }
    return 0;
  };
  const binary = n => {
    const a = evaluate(n.a), b = evaluate(n.b);
    switch (n.o) {
      case '||': return truthy(a) || truthy(b);
      case '&&': return truthy(a) && truthy(b);
      case '==': case '!=': case '<': case '<=': case '>': case '>=': {
        let c;
        if (typeof a === 'string' && typeof b === 'string') c = cmpText(a, b);
        else { const x = toNum(a), y = toNum(b); c = x < y ? -1 : x > y ? 1 : 0; }
        switch (n.o) {
          case '==': return c === 0;
          case '!=': return c !== 0;
          case '<': return c < 0;
          case '<=': return c <= 0;
          case '>': return c > 0;
          default: return c >= 0;
        }
      }
    }
    const x = toNum(a), y = toNum(b);
    switch (n.o) {
      case '+': return fin(x + y);
      case '-': return fin(x - y);
      case '*': return fin(x * y);
      case '/': return y === 0 ? 0 : fin(x / y);
      case '%': return y === 0 ? 0 : fin(x % y);
      case '^': return fin(Math.pow(x, y));
    }
    return 0;
  };
  const call = n => {
    const args = n.args;
    const num = i => (i < args.length ? toNum(evaluate(args[i])) : 0);
    switch (n.f) {
      case 'min': return args.length ? fin(Math.min(...args.map((_, i) => num(i)))) : 0;
      case 'max': return args.length ? fin(Math.max(...args.map((_, i) => num(i)))) : 0;
      case 'round': return roundTo(num(0), args.length > 1 ? num(1) : 0);
      case 'floor': return fin(Math.floor(num(0)));
      case 'ceil': return fin(Math.ceil(num(0)));
      case 'abs': return fin(Math.abs(num(0)));
      case 'clamp': return fin(Math.min(Math.max(num(0), num(1)), num(2)));
      case 'sum': {
        let total = 0;
        for (const a of args) {
          if (a.t === 'tbl') { for (const v of Object.values(obj(tables[a.v]))) if (typeof v === 'number') total += v; }
          else total += toNum(evaluate(a));
        }
        return fin(total);
      }
      case 'lookup': {
        const fallback = args.length > 2 ? evaluate(args[2]) : 0;
        if (!args.length || args[0].t !== 'tbl' || args.length < 2) return fallback;
        const key = toText(evaluate(args[1])), table = obj(tables[args[0].v]);
        return own(table, key) ? table[key] : fallback;
      }
      case 'if': return truthy(args.length ? evaluate(args[0]) : false) ? (args.length > 1 ? evaluate(args[1]) : 0) : (args.length > 2 ? evaluate(args[2]) : 0);
    }
    return 0;
  };

  const compiled = {};
  for (const [name, src] of entries(sources)) compiled[name] = compile(src);
  const refs = (n, acc) => {
    if (!n || typeof n !== 'object') return acc;
    if (n.t === 'var') acc.add(n.v);
    if (n.a) refs(n.a, acc);
    if (n.b) refs(n.b, acc);
    if (n.args) for (const a of n.args) refs(a, acc);
    return acc;
  };
  const order = [], seen = new Set();
  const visit = name => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const d of refs(compiled[name], new Set())) if (own(compiled, d)) visit(d);
    order.push(name);
  };
  for (const name of Object.keys(compiled)) visit(name);

  const recompute = () => {
    const changed = [];
    for (const name of order) {
      const next = compiled[name] ? evaluate(compiled[name]) : 0;
      if (!own(res, name) || res[name] !== next) { res[name] = next; changed.push(name); }
    }
    return changed;
  };
  recompute();

  const valueOf = name => (own(vals, name) ? vals[name] : own(res, name) ? res[name] : undefined);

  const subs = new Map();
  const inputs = new Map();
  const outputs = [];
  const cssNames = new Set(entries(defs).filter(([name, def]) => def && def.cssVar === true && types[name] !== 'text').map(([name]) => name));
  const dirty = new Set();
  let flushing = false, skip = null;

  const paintVar = name => {
    const v = vals[name], s = typeof v === 'boolean' ? (v ? '1' : '0') : numText(v), key = `--fw-v-${name}`;
    if (html.style.getPropertyValue(key) !== s) html.style.setProperty(key, s);
  };
  const writeInput = (el, v) => {
    if (el.type === 'checkbox') { const on = truthy(v); if (el.checked !== on) el.checked = on; }
    else if (el.type === 'radio') { const on = el.value === toText(v); if (el.checked !== on) el.checked = on; }
    else { const s = toText(v); if (el.value !== s) el.value = s; }
  };
  const paintOutput = out => {
    const v = valueOf(out.from);
    const s = typeof v === 'string' || typeof v === 'boolean' ? `${out.o.prefix || ''}${String(v)}${out.o.suffix || ''}` : format(toNum(v), out.o);
    if (out.node.data !== s) out.node.data = s;
  };
  const render = names => {
    for (const name of names) {
      if (cssNames.has(name)) paintVar(name);
      const list = inputs.get(name);
      if (list && own(vals, name)) for (const el of list) if (el !== skip) writeInput(el, vals[name]);
    }
    for (const out of outputs) if (names.has(out.from)) paintOutput(out);
    for (const name of names) {
      const fns = subs.get(name);
      if (fns) for (const fn of [...fns]) guard(() => fn(valueOf(name), name));
    }
  };
  const flush = () => {
    if (flushing) return;
    flushing = true;
    try {
      for (let turns = 0; dirty.size && turns < 100; turns++) {
        const names = new Set(dirty);
        dirty.clear();
        for (const name of recompute()) names.add(name);
        render(names);
      }
    } finally { flushing = false; dirty.clear(); }
  };
  const set = (name, value) => {
    if (typeof name !== 'string' || !own(types, name)) return;
    const next = coerce(types[name], value);
    if (vals[name] === next) return;
    vals[name] = next;
    dirty.add(name);
    flush();
  };
  const get = name => (typeof name === 'string' ? valueOf(name) : undefined);
  const subscribe = (name, fn) => {
    if (typeof fn !== 'function') return () => {};
    let fns = subs.get(name);
    if (!fns) subs.set(name, (fns = new Set()));
    fns.add(fn);
    return () => { fns.delete(fn); };
  };
  globalThis.__formwebVariables = Object.freeze({ get, set, subscribe });

  const cache = new Map();
  (globalThis.__formwebActions ||= {})['set-variable'] = step => {
    if (!step || typeof step !== 'object') return;
    const name = step.variable;
    if (typeof name !== 'string' || !own(types, name)) return;
    if (step.value !== undefined) { set(name, step.value); return; }
    if (typeof step.formula !== 'string') return;
    if (!cache.has(step.formula)) cache.set(step.formula, compile(step.formula));
    const tree = cache.get(step.formula);
    if (tree) set(name, evaluate(tree));
  };

  const read = el => {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'radio') return el.checked ? el.value : undefined;
    return el.value;
  };
  const textNode = el => {
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first) return first;
    const created = doc.createTextNode('');
    el.appendChild(created);
    return created;
  };

  ready(() => {
    for (const [id, o] of entries(spec.inputs)) {
      if (!o || typeof o.variable !== 'string' || !own(types, o.variable)) continue;
      const name = o.variable, event = o.event === 'change' ? 'change' : 'input';
      for (const el of nodes(id)) guard(() => {
        let list = inputs.get(name);
        if (!list) inputs.set(name, (list = []));
        list.push(el);
        if (el.tagName === 'SELECT') writeInput(el, vals[name]);
        el.addEventListener(event, () => {
          const v = read(el);
          if (v === undefined) return;
          skip = el;
          try { set(name, v); } finally { skip = null; }
        });
      });
    }
    for (const [id, o] of entries(spec.outputs)) {
      if (!o || typeof o.from !== 'string') continue;
      for (const el of nodes(id)) guard(() => {
        const out = { from: o.from, o, node: textNode(el) };
        outputs.push(out);
        paintOutput(out);
      });
    }
    for (const name of cssNames) paintVar(name);
  });
})();
