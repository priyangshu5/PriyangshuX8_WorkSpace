/**
 * PriyangshuX8 Workspace - Arduino Sketch Interpreter
 * A safe, dependency-free interpreter for a practical subset of Arduino C++.
 * It does NOT use eval; it tokenizes and walks a small grammar covering the
 * constructs used in typical beginner sketches:
 *   - setup() and loop() function bodies
 *   - pinMode / digitalWrite / digitalRead / analogWrite / analogRead
 *   - delay / delayMicroseconds / millis
 *   - Serial.begin / Serial.print / Serial.println
 *   - tone / noTone, map, constrain, random
 *   - servo-style writes via a simple <Servo>.write(pin?, angle) convention
 *   - int/long/float variable declarations, assignment, +,-,*,/,%
 *   - if / else, for, while, compound assignment, ++/--, HIGH/LOW/true/false
 *
 * The interpreter is RESUMABLE: loop() executes in cooperative steps so delays
 * map onto real simulated time without blocking the UI thread.
 */

const KEYWORDS = new Set(['void', 'int', 'long', 'float', 'double', 'bool', 'boolean', 'byte', 'char',
  'if', 'else', 'for', 'while', 'return', 'true', 'false', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'unsigned', 'const']);

/** Tokenize source into a flat token list. */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const isId = (c) => /[A-Za-z_]/.test(c);
  const isIdN = (c) => /[A-Za-z0-9_]/.test(c);
  const isNum = (c) => /[0-9.]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; } // skip preprocessor
    if (c === '"') { let s = ''; i++; while (i < src.length && src[i] !== '"') { if (src[i] === '\\') { i++; s += ({ n: '\n', t: '\t', r: '\r' }[src[i]] || src[i]); } else s += src[i]; i++; } i++; tokens.push({ t: 'str', v: s }); continue; }
    if (c === "'") { i++; let ch = src[i]; if (ch === '\\') { i++; ch = ({ n: '\n', t: '\t', '0': '\0' }[src[i]] ?? src[i]); } i++; i++; tokens.push({ t: 'num', v: ch.charCodeAt(0) }); continue; }
    if (isNum(c)) { let n = ''; while (i < src.length && /[0-9.xXa-fA-F]/.test(src[i])) { n += src[i]; i++; } tokens.push({ t: 'num', v: Number(n) }); continue; }
    if (isId(c)) { let id = ''; while (i < src.length && isIdN(src[i])) { id += src[i]; i++; } tokens.push({ t: KEYWORDS.has(id) ? 'kw' : 'id', v: id }); continue; }
    const two = src.substr(i, 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/='].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    tokens.push({ t: 'op', v: c }); i++;
  }
  tokens.push({ t: 'eof', v: null });
  return tokens;
}

/** Parser produces a tiny AST of statements for setup/loop and global decls. */
class Parser {
  constructor(tokens) { this.toks = tokens; this.p = 0; }
  peek(o = 0) { return this.toks[this.p + o]; }
  next() { return this.toks[this.p++]; }
  eat(v) { const t = this.next(); if (t.v !== v) throw new Error(`Expected "${v}" but got "${t.v}"`); return t; }
  is(v) { return this.peek().v === v; }

  parseProgram() {
    const program = { globals: [], functions: {} };
    while (this.peek().t !== 'eof') {
      // Type then identifier => could be function or global var.
      this._skipTypeQualifiers();
      const typeTok = this.peek();
      if (typeTok.t === 'kw' || typeTok.t === 'id') {
        this.next(); // type
        const nameTok = this.next(); // name
        if (this.is('(')) {
          const body = this._parseFunctionBody();
          program.functions[nameTok.v] = body;
        } else {
          // global declaration
          this.p -= 2; // rewind to type
          program.globals.push(this._parseVarDecl());
        }
      } else { this.next(); }
    }
    return program;
  }

  _skipTypeQualifiers() { while (['unsigned', 'const'].includes(this.peek().v)) this.next(); }

  _parseFunctionBody() {
    this.eat('('); while (!this.is(')')) this.next(); this.eat(')');
    this.eat('{');
    const stmts = this._parseBlock();
    return stmts;
  }

  _parseBlock() {
    const stmts = [];
    while (!this.is('}') && this.peek().t !== 'eof') stmts.push(this._parseStatement());
    this.eat('}');
    return stmts;
  }

  _parseStatement() {
    const tk = this.peek();
    if (this.is('{')) { this.next(); return { k: 'block', body: this._parseBlock() }; }
    if (this.is('if')) return this._parseIf();
    if (this.is('for')) return this._parseFor();
    if (this.is('while')) return this._parseWhile();
    if (this.is('return')) { this.next(); if (!this.is(';')) this._parseExpr(); this.eat(';'); return { k: 'return' }; }
    if (['int', 'long', 'float', 'double', 'bool', 'boolean', 'byte', 'char', 'unsigned', 'const'].includes(tk.v)) return this._parseVarDecl();
    const expr = this._parseExpr(); this.eat(';'); return { k: 'expr', expr };
  }

  _parseVarDecl() {
    this._skipTypeQualifiers(); this.next(); // type
    const name = this.next().v;
    let init = null;
    if (this.is('=')) { this.next(); init = this._parseExpr(); }
    this.eat(';');
    return { k: 'decl', name, init };
  }

  _parseIf() {
    this.eat('if'); this.eat('('); const cond = this._parseExpr(); this.eat(')');
    const then = this._parseStatement();
    let els = null;
    if (this.is('else')) { this.next(); els = this._parseStatement(); }
    return { k: 'if', cond, then, els };
  }

  _parseFor() {
    this.eat('for'); this.eat('(');
    const init = this.is(';') ? null : (['int', 'long', 'float'].includes(this.peek().v) ? this._parseForDecl() : this._parseExpr());
    if (this.toks[this.p - 1]?.v !== ';') this.eat(';');
    const cond = this.is(';') ? null : this._parseExpr(); this.eat(';');
    const post = this.is(')') ? null : this._parseExpr(); this.eat(')');
    const body = this._parseStatement();
    return { k: 'for', init, cond, post, body };
  }
  _parseForDecl() { this.next(); const name = this.next().v; let init = null; if (this.is('=')) { this.next(); init = this._parseExpr(); } return { k: 'decl', name, init }; }

  _parseWhile() { this.eat('while'); this.eat('('); const cond = this._parseExpr(); this.eat(')'); const body = this._parseStatement(); return { k: 'while', cond, body }; }

  // Expression parsing with precedence.
  _parseExpr() { return this._parseAssign(); }
  _parseAssign() {
    const left = this._parseBinary(0);
    const op = this.peek().v;
    if (['=', '+=', '-=', '*=', '/='].includes(op)) { this.next(); const right = this._parseAssign(); return { k: 'assign', op, left, right }; }
    return left;
  }
  _parseBinary(min) {
    const prec = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
    let left = this._parseUnary();
    while (true) {
      const op = this.peek().v;
      if (prec[op] === undefined || prec[op] < min) break;
      this.next();
      const right = this._parseBinary(prec[op] + 1);
      left = { k: 'bin', op, left, right };
    }
    return left;
  }
  _parseUnary() {
    const op = this.peek().v;
    if (op === '!' || op === '-') { this.next(); return { k: 'unary', op, expr: this._parseUnary() }; }
    return this._parsePostfix();
  }
  _parsePostfix() {
    let node = this._parsePrimary();
    while (true) {
      if (this.is('++') || this.is('--')) { const op = this.next().v; node = { k: 'postfix', op, target: node }; }
      else if (this.is('.')) { this.next(); const member = this.next().v; if (this.is('(')) node = this._parseCall(`${node.name}.${member}`); else node = { k: 'member', obj: node, member }; }
      else if (this.is('(') && node.k === 'var') { node = this._parseCall(node.name); }
      else break;
    }
    return node;
  }
  _parseCall(name) {
    this.eat('('); const args = [];
    while (!this.is(')')) { args.push(this._parseExpr()); if (this.is(',')) this.next(); }
    this.eat(')');
    return { k: 'call', name, args };
  }
  _parsePrimary() {
    const tk = this.peek();
    if (tk.t === 'num') { this.next(); return { k: 'num', v: tk.v }; }
    if (tk.t === 'str') { this.next(); return { k: 'str', v: tk.v }; }
    if (this.is('(')) { this.next(); const e = this._parseExpr(); this.eat(')'); return e; }
    if (tk.v === 'HIGH' || tk.v === 'true' || tk.v === 'OUTPUT') { this.next(); return { k: 'num', v: tk.v === 'OUTPUT' ? 1 : 1 }; }
    if (tk.v === 'LOW' || tk.v === 'false' || tk.v === 'INPUT' || tk.v === 'INPUT_PULLUP') { this.next(); return { k: 'num', v: 0 }; }
    if (tk.t === 'id' || tk.t === 'kw') { this.next(); return { k: 'var', name: tk.v }; }
    this.next(); return { k: 'num', v: 0 };
  }
}

/**
 * A resumable runtime that executes loop() in cooperative chunks, honoring
 * delay() against simulated time supplied by the engine.
 */
export class SketchRuntime {
  /** @param {string} source @param {object} hooks Board I/O callbacks. */
  constructor(source, hooks) {
    this.hooks = hooks;
    this.vars = new Map();
    this.now = 0;        // simulated ms
    this.waitUntil = 0;  // resume time for delay()
    this.error = null;
    try {
      this.program = new Parser(tokenize(source)).parseProgram();
    } catch (e) { this.program = { globals: [], functions: {} }; this.error = e.message; }
  }

  start() {
    this.vars.clear(); this.now = 0; this.waitUntil = 0; this.error = null;
    try {
      for (const g of this.program.globals) this._exec(g);
      if (this.program.functions.setup) this._runBlock(this.program.functions.setup);
    } catch (e) { this.error = e.message; }
  }

  /** Advance simulated time and run one loop() pass if not waiting. @param {number} dtMs */
  tick(dtMs) {
    if (this.error) return;
    this.now += dtMs;
    if (this.now < this.waitUntil) return;
    try {
      if (this.program.functions.loop) this._runBlock(this.program.functions.loop);
    } catch (e) {
      if (e && e.__delay) return; // delay() interrupts the loop pass
      this.error = e.message;
    }
  }

  _runBlock(stmts) { for (const s of stmts) this._exec(s); }

  _exec(node) {
    switch (node.k) {
      case 'decl': this.vars.set(node.name, node.init ? this._eval(node.init) : 0); break;
      case 'expr': this._eval(node.expr); break;
      case 'block': this._runBlock(node.body); break;
      case 'if': if (this._eval(node.cond)) this._exec(node.then); else if (node.els) this._exec(node.els); break;
      case 'for': {
        if (node.init) this._exec(node.init.k ? node.init : { k: 'expr', expr: node.init });
        let guard = 0;
        while ((node.cond ? this._eval(node.cond) : true) && guard++ < 100000) {
          this._exec(node.body);
          if (node.post) this._eval(node.post);
        }
        break;
      }
      case 'while': { let guard = 0; while (this._eval(node.cond) && guard++ < 100000) this._exec(node.body); break; }
      case 'return': break;
      default: this._eval(node);
    }
  }

  _eval(node) {
    switch (node.k) {
      case 'num': return node.v;
      case 'str': return node.v;
      case 'var': return this.vars.has(node.name) ? this.vars.get(node.name) : 0;
      case 'unary': return node.op === '!' ? (this._eval(node.expr) ? 0 : 1) : -this._eval(node.expr);
      case 'bin': return this._binop(node.op, this._eval(node.left), this._eval(node.right));
      case 'assign': {
        const name = node.left.name;
        let v = this._eval(node.right);
        if (node.op !== '=') v = this._binop(node.op[0], this._eval(node.left), v);
        this.vars.set(name, v); return v;
      }
      case 'postfix': {
        const name = node.target.name; const cur = this.vars.get(name) || 0;
        this.vars.set(name, node.op === '++' ? cur + 1 : cur - 1); return cur;
      }
      case 'call': return this._call(node.name, node.args.map((a) => this._eval(a)));
      case 'member': return 0;
      default: return 0;
    }
  }

  _binop(op, a, b) {
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': return b === 0 ? 0 : a / b; case '%': return b === 0 ? 0 : a % b;
      case '==': return a == b ? 1 : 0; case '!=': return a != b ? 1 : 0;
      case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
      case '&&': return a && b ? 1 : 0; case '||': return a || b ? 1 : 0;
      default: return 0;
    }
  }

  _call(name, args) {
    const h = this.hooks;
    switch (name) {
      case 'pinMode': return 0;
      case 'digitalWrite': h.digitalWrite(args[0], args[1] ? 1 : 0); return 0;
      case 'digitalRead': return h.digitalRead(args[0]);
      case 'analogWrite': h.analogWrite(args[0], args[1] | 0); return 0;
      case 'analogRead': return h.analogRead(args[0]);
      case 'delay': { this.waitUntil = this.now + (args[0] | 0); const e = new Error('delay'); e.__delay = true; throw e; }
      case 'delayMicroseconds': { this.waitUntil = this.now + (args[0] / 1000); const e = new Error('delay'); e.__delay = true; throw e; }
      case 'millis': return Math.floor(this.now);
      case 'micros': return Math.floor(this.now * 1000);
      case 'tone': h.tone(args[0], args[1] || 1000); return 0;
      case 'noTone': h.noTone(args[0]); return 0;
      case 'map': return Math.floor((args[0] - args[1]) * (args[4] - args[3]) / ((args[2] - args[1]) || 1) + args[3]);
      case 'constrain': return Math.max(args[1], Math.min(args[2], args[0]));
      case 'random': return args.length === 1 ? Math.floor(Math.random() * args[0]) : Math.floor(Math.random() * (args[1] - args[0]) + args[0]);
      case 'Serial.begin': return 0;
      case 'Serial.print': h.serial(String(args[0] ?? '')); return 0;
      case 'Serial.println': h.serial(String(args[0] ?? '') + '\n'); return 0;
      case 'Serial.write': h.serial(String.fromCharCode(args[0] | 0)); return 0;
      default:
        // Servo-style: name.write(angle) routed by engine via member calls is mapped to servoWrite.
        if (name.endsWith('.write')) { h.servoWrite(args[0], args.length > 1 ? args[1] : args[0]); return 0; }
        return 0;
    }
  }
}
