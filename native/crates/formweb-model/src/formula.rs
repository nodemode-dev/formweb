use serde_json::{Map, Number, Value};
use std::collections::{BTreeMap, BTreeSet};

pub const FUNCTIONS: &[&str] = &["min", "max", "round", "floor", "ceil", "abs", "clamp", "sum", "lookup", "if"];
const OPERATORS: &[&str] = &["&&", "||", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "^", "!", "(", ")", ","];

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BinOp { Or, And, Eq, Ne, Lt, Le, Gt, Ge, Add, Sub, Mul, Div, Rem, Pow }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum UnOp { Neg, Not }

#[derive(Clone, Debug, PartialEq)]
pub enum Expr {
    Num(f64),
    Str(String),
    Bool(bool),
    Name(String),
    Unary(UnOp, Box<Expr>),
    Binary(BinOp, Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
}

#[derive(Clone, Debug, PartialEq)]
enum Tok { Num(f64), Str(String), Name(String), Op(&'static str) }

fn tokenize(source: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if matches!(c, ' ' | '\t' | '\n' | '\r') { i += 1; continue; }
        if tokens.len() >= 512 { return Err("formula exceeds 512 tokens".into()); }
        if c.is_ascii_digit() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_digit() { i += 1; }
            if i + 1 < chars.len() && chars[i] == '.' && chars[i + 1].is_ascii_digit() {
                i += 1;
                while i < chars.len() && chars[i].is_ascii_digit() { i += 1; }
            }
            if i < chars.len() && (chars[i] == 'e' || chars[i] == 'E') {
                let mut j = i + 1;
                if j < chars.len() && (chars[j] == '+' || chars[j] == '-') { j += 1; }
                if j < chars.len() && chars[j].is_ascii_digit() {
                    while j < chars.len() && chars[j].is_ascii_digit() { j += 1; }
                    i = j;
                }
            }
            let text: String = chars[start..i].iter().collect();
            let number = text.parse::<f64>().map_err(|_| "invalid number".to_string())?;
            if !number.is_finite() { return Err("number out of range".into()); }
            tokens.push(Tok::Num(number));
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') { i += 1; }
            tokens.push(Tok::Name(chars[start..i].iter().collect()));
            continue;
        }
        if c == '"' {
            i += 1;
            let mut text = String::new();
            let mut count = 0;
            loop {
                let Some(&d) = chars.get(i) else { return Err("unterminated string".into()) };
                i += 1;
                if d == '"' { break; }
                if d == '\\' { return Err("strings cannot contain a backslash".into()); }
                count += 1;
                if count > 200 { return Err("string exceeds 200 characters".into()); }
                text.push(d);
            }
            tokens.push(Tok::Str(text));
            continue;
        }
        let found = OPERATORS.iter().find(|op| op.chars().enumerate().all(|(k, ch)| chars.get(i + k) == Some(&ch)));
        match found {
            Some(op) => { tokens.push(Tok::Op(op)); i += op.len(); }
            None => return Err(format!("unexpected character {c}")),
        }
    }
    Ok(tokens)
}

struct Parser { tokens: Vec<Tok>, at: usize, depth: usize }

fn arity_ok(name: &str, count: usize) -> bool {
    match name {
        "min" | "max" | "sum" => count >= 1,
        "round" => (1..=2).contains(&count),
        "floor" | "ceil" | "abs" => count == 1,
        "clamp" | "if" => count == 3,
        "lookup" => (2..=3).contains(&count),
        _ => false,
    }
}

impl Parser {
    fn enter(&mut self) -> Result<(), String> {
        self.depth += 1;
        if self.depth > 64 { Err("formula nests deeper than 64 levels".into()) } else { Ok(()) }
    }
    fn peek_op(&self) -> Option<&'static str> { match self.tokens.get(self.at) { Some(Tok::Op(op)) => Some(*op), _ => None } }
    fn take(&mut self, op: &str) -> bool { if self.peek_op() == Some(op) { self.at += 1; true } else { false } }
    fn expect(&mut self, op: &str) -> Result<(), String> { if self.take(op) { Ok(()) } else { Err(format!("expected {op}")) } }
    fn expr(&mut self) -> Result<Expr, String> {
        self.enter()?;
        let result = self.or();
        self.depth -= 1;
        result
    }
    fn or(&mut self) -> Result<Expr, String> {
        let mut left = self.and()?;
        while self.take("||") { let right = self.and()?; left = Expr::Binary(BinOp::Or, Box::new(left), Box::new(right)); }
        Ok(left)
    }
    fn and(&mut self) -> Result<Expr, String> {
        let mut left = self.cmp()?;
        while self.take("&&") { let right = self.cmp()?; left = Expr::Binary(BinOp::And, Box::new(left), Box::new(right)); }
        Ok(left)
    }
    fn cmp(&mut self) -> Result<Expr, String> {
        let left = self.add()?;
        let op = match self.peek_op() {
            Some("==") => BinOp::Eq, Some("!=") => BinOp::Ne, Some("<") => BinOp::Lt,
            Some("<=") => BinOp::Le, Some(">") => BinOp::Gt, Some(">=") => BinOp::Ge,
            _ => return Ok(left),
        };
        self.at += 1;
        let right = self.add()?;
        Ok(Expr::Binary(op, Box::new(left), Box::new(right)))
    }
    fn add(&mut self) -> Result<Expr, String> {
        let mut left = self.mul()?;
        loop {
            let op = match self.peek_op() { Some("+") => BinOp::Add, Some("-") => BinOp::Sub, _ => break };
            self.at += 1;
            let right = self.mul()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn mul(&mut self) -> Result<Expr, String> {
        let mut left = self.unary()?;
        loop {
            let op = match self.peek_op() { Some("*") => BinOp::Mul, Some("/") => BinOp::Div, Some("%") => BinOp::Rem, _ => break };
            self.at += 1;
            let right = self.unary()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
    fn unary(&mut self) -> Result<Expr, String> {
        self.enter()?;
        let result = if self.take("-") {
            self.unary().map(|inner| Expr::Unary(UnOp::Neg, Box::new(inner)))
        } else if self.take("!") {
            self.unary().map(|inner| Expr::Unary(UnOp::Not, Box::new(inner)))
        } else {
            self.pow()
        };
        self.depth -= 1;
        result
    }
    fn pow(&mut self) -> Result<Expr, String> {
        let base = self.atom()?;
        if self.take("^") {
            let exponent = self.unary()?;
            return Ok(Expr::Binary(BinOp::Pow, Box::new(base), Box::new(exponent)));
        }
        Ok(base)
    }
    fn atom(&mut self) -> Result<Expr, String> {
        let token = self.tokens.get(self.at).cloned().ok_or("formula ended early")?;
        self.at += 1;
        match token {
            Tok::Num(n) => Ok(Expr::Num(n)),
            Tok::Str(s) => Ok(Expr::Str(s)),
            Tok::Name(name) => {
                if self.take("(") {
                    if !FUNCTIONS.contains(&name.as_str()) { return Err(format!("unknown function {name}")); }
                    let mut args = Vec::new();
                    if !self.take(")") {
                        loop {
                            args.push(self.expr()?);
                            if self.take(",") { continue; }
                            self.expect(")")?;
                            break;
                        }
                    }
                    if !arity_ok(&name, args.len()) { return Err(format!("wrong number of arguments to {name}")); }
                    if name == "lookup" && !matches!(args[0], Expr::Name(_)) { return Err("lookup needs a table name as its first argument".into()); }
                    return Ok(Expr::Call(name, args));
                }
                match name.as_str() {
                    "true" => Ok(Expr::Bool(true)),
                    "false" => Ok(Expr::Bool(false)),
                    _ => Ok(Expr::Name(name)),
                }
            }
            Tok::Op("(") => {
                let inner = self.expr()?;
                self.expect(")")?;
                Ok(inner)
            }
            Tok::Op(op) => Err(format!("unexpected {op}")),
        }
    }
}

pub fn parse(source: &str) -> Result<Expr, String> {
    let tokens = tokenize(source)?;
    if tokens.is_empty() { return Err("formula is empty".into()); }
    let mut parser = Parser { tokens, at: 0, depth: 0 };
    let expr = parser.expr()?;
    if parser.at != parser.tokens.len() { return Err("unexpected token after the formula".into()); }
    Ok(expr)
}

fn collect(expr: &Expr, out: &mut Vec<(String, bool)>) {
    match expr {
        Expr::Name(name) => out.push((name.clone(), false)),
        Expr::Unary(_, inner) => collect(inner, out),
        Expr::Binary(_, left, right) => { collect(left, out); collect(right, out); }
        Expr::Call(name, args) => {
            for (index, arg) in args.iter().enumerate() {
                match arg {
                    Expr::Name(table) if (name == "lookup" && index == 0) || name == "sum" => out.push((table.clone(), true)),
                    _ => collect(arg, out),
                }
            }
        }
        _ => {}
    }
}

pub fn references(expr: &Expr) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    collect(expr, &mut out);
    out
}

pub fn lookup_tables(expr: &Expr) -> Vec<String> {
    let mut out = Vec::new();
    fn walk(expr: &Expr, out: &mut Vec<String>) {
        match expr {
            Expr::Unary(_, inner) => walk(inner, out),
            Expr::Binary(_, left, right) => { walk(left, out); walk(right, out); }
            Expr::Call(name, args) => {
                if name == "lookup" { if let Some(Expr::Name(table)) = args.first() { out.push(table.clone()); } }
                for arg in args { walk(arg, out); }
            }
            _ => {}
        }
    }
    walk(expr, &mut out);
    out
}

#[derive(Clone, Debug)]
enum V { N(f64), S(String), B(bool) }

struct Ctx<'a> { env: &'a BTreeMap<String, V>, tables: &'a Map<String, Value> }

fn fin(x: f64) -> f64 { if x.is_finite() && x != 0.0 { x } else { 0.0 } }

fn decimal_literal(text: &str) -> bool {
    let b = text.as_bytes();
    let mut i = 0;
    if b.get(i) == Some(&b'-') { i += 1; }
    let digits = |i: &mut usize| { let start = *i; while *i < b.len() && b[*i].is_ascii_digit() { *i += 1; } *i > start };
    if !digits(&mut i) { return false; }
    if b.get(i) == Some(&b'.') { i += 1; if !digits(&mut i) { return false; } }
    if matches!(b.get(i), Some(b'e') | Some(b'E')) {
        i += 1;
        if matches!(b.get(i), Some(b'+') | Some(b'-')) { i += 1; }
        if !digits(&mut i) { return false; }
    }
    i == b.len()
}

fn text_number(text: &str) -> f64 {
    let trimmed = text.trim();
    if !decimal_literal(trimmed) { return 0.0; }
    fin(trimmed.parse::<f64>().unwrap_or(0.0))
}

fn num(v: &V) -> f64 {
    match v { V::N(n) => *n, V::B(b) => if *b { 1.0 } else { 0.0 }, V::S(s) => text_number(s) }
}

fn truthy(v: &V) -> bool {
    match v { V::N(n) => *n != 0.0, V::S(s) => !s.is_empty(), V::B(b) => *b }
}

fn text_of(v: &V) -> String {
    match v { V::N(n) => number_text(*n), V::S(s) => s.clone(), V::B(b) => b.to_string() }
}

fn power_of_ten(digits: u32) -> f64 {
    let mut p = 1.0;
    for _ in 0..digits { p *= 10.0; }
    p
}

fn round_places(x: f64, digits: u32) -> f64 {
    let p = power_of_ten(digits);
    fin(x.signum() * (x.abs() * p + 0.5).floor() / p)
}

fn compare(op: BinOp, a: &V, b: &V) -> bool {
    use std::cmp::Ordering;
    let order = match (a, b) {
        (V::S(x), V::S(y)) => Some(x.encode_utf16().cmp(y.encode_utf16())),
        _ => num(a).partial_cmp(&num(b)),
    };
    match (op, order) {
        (BinOp::Eq, Some(Ordering::Equal)) => true,
        (BinOp::Ne, Some(Ordering::Equal)) => false,
        (BinOp::Ne, _) => true,
        (BinOp::Lt, Some(Ordering::Less)) => true,
        (BinOp::Le, Some(Ordering::Less | Ordering::Equal)) => true,
        (BinOp::Gt, Some(Ordering::Greater)) => true,
        (BinOp::Ge, Some(Ordering::Greater | Ordering::Equal)) => true,
        _ => false,
    }
}

fn eval(expr: &Expr, c: &Ctx) -> V {
    match expr {
        Expr::Num(n) => V::N(*n),
        Expr::Str(s) => V::S(s.clone()),
        Expr::Bool(b) => V::B(*b),
        Expr::Name(name) => c.env.get(name).cloned().unwrap_or(V::N(0.0)),
        Expr::Unary(UnOp::Neg, inner) => V::N(fin(-num(&eval(inner, c)))),
        Expr::Unary(UnOp::Not, inner) => V::B(!truthy(&eval(inner, c))),
        Expr::Binary(op, left, right) => {
            let a = eval(left, c);
            let b = eval(right, c);
            match op {
                BinOp::Or => V::B(truthy(&a) || truthy(&b)),
                BinOp::And => V::B(truthy(&a) && truthy(&b)),
                BinOp::Eq | BinOp::Ne | BinOp::Lt | BinOp::Le | BinOp::Gt | BinOp::Ge => V::B(compare(*op, &a, &b)),
                BinOp::Add => V::N(fin(num(&a) + num(&b))),
                BinOp::Sub => V::N(fin(num(&a) - num(&b))),
                BinOp::Mul => V::N(fin(num(&a) * num(&b))),
                BinOp::Div => { let d = num(&b); V::N(if d == 0.0 { 0.0 } else { fin(num(&a) / d) }) }
                BinOp::Rem => { let d = num(&b); V::N(if d == 0.0 { 0.0 } else { fin(num(&a) % d) }) }
                BinOp::Pow => V::N(fin(num(&a).powf(num(&b)))),
            }
        }
        Expr::Call(name, args) => call(name, args, c),
    }
}

fn table_value(value: Option<&Value>) -> Option<V> {
    match value {
        Some(Value::Number(n)) => Some(V::N(fin(n.as_f64().unwrap_or(0.0)))),
        Some(Value::String(s)) => Some(V::S(s.clone())),
        _ => None,
    }
}

fn call(name: &str, args: &[Expr], c: &Ctx) -> V {
    let n = |i: usize| num(&eval(&args[i], c));
    match name {
        "min" => V::N(fin((0..args.len()).map(n).fold(f64::INFINITY, f64::min))),
        "max" => V::N(fin((0..args.len()).map(n).fold(f64::NEG_INFINITY, f64::max))),
        "round" => {
            let digits = if args.len() > 1 { n(1).floor().clamp(0.0, 10.0) as u32 } else { 0 };
            V::N(round_places(n(0), digits))
        }
        "floor" => V::N(fin(n(0).floor())),
        "ceil" => V::N(fin(n(0).ceil())),
        "abs" => V::N(fin(n(0).abs())),
        "clamp" => V::N(fin(n(0).max(n(1)).min(n(2)))),
        "sum" => {
            let mut total = 0.0;
            for arg in args {
                match arg {
                    Expr::Name(table) if c.tables.contains_key(table) && !c.env.contains_key(table) => {
                        if let Some(entries) = c.tables[table].as_object() {
                            for entry in entries.values() { if let Some(x) = entry.as_f64() { total += x; } }
                        }
                    }
                    _ => total += num(&eval(arg, c)),
                }
            }
            V::N(fin(total))
        }
        "lookup" => {
            let key = text_of(&eval(&args[1], c));
            let found = match &args[0] {
                Expr::Name(table) => c.tables.get(table).and_then(Value::as_object).and_then(|entries| table_value(entries.get(&key))),
                _ => None,
            };
            found.unwrap_or_else(|| args.get(2).map(|fallback| eval(fallback, c)).unwrap_or(V::N(0.0)))
        }
        _ => if truthy(&eval(&args[0], c)) { eval(&args[1], c) } else { eval(&args[2], c) },
    }
}

fn initial_of(definition: &Value) -> V {
    let initial = definition.get("initial");
    match definition.get("type").and_then(Value::as_str) {
        Some("text") => V::S(initial.and_then(Value::as_str).unwrap_or("").to_string()),
        Some("boolean") => V::B(initial.and_then(Value::as_bool).unwrap_or(false)),
        _ => V::N(fin(initial.and_then(Value::as_f64).unwrap_or(0.0))),
    }
}

fn to_json(v: &V) -> Value {
    match v {
        V::N(n) => Value::Number(Number::from_f64(*n).unwrap_or_else(|| Number::from(0))),
        V::S(s) => Value::String(s.clone()),
        V::B(b) => Value::Bool(*b),
    }
}

fn resolve(name: &str, formulas: &Map<String, Value>, tables: &Map<String, Value>, env: &mut BTreeMap<String, V>, visiting: &mut BTreeSet<String>) {
    if env.contains_key(name) || !visiting.insert(name.to_string()) { return; }
    let result = match formulas.get(name).and_then(Value::as_str).map(parse) {
        Some(Ok(expr)) => {
            for (reference, _) in references(&expr) {
                if formulas.contains_key(&reference) { resolve(&reference, formulas, tables, env, visiting); }
            }
            eval(&expr, &Ctx { env: &*env, tables })
        }
        _ => V::N(0.0),
    };
    env.insert(name.to_string(), result);
    visiting.remove(name);
}

pub fn evaluate(group: &Value) -> BTreeMap<String, Value> {
    let empty = Map::new();
    let values = group.get("values").and_then(Value::as_object).unwrap_or(&empty);
    let tables = group.get("tables").and_then(Value::as_object).unwrap_or(&empty);
    let formulas = group.get("formulas").and_then(Value::as_object).unwrap_or(&empty);
    let mut env: BTreeMap<String, V> = BTreeMap::new();
    for (name, definition) in values { env.insert(name.clone(), initial_of(definition)); }
    let mut visiting = BTreeSet::new();
    for name in formulas.keys() { resolve(name, formulas, tables, &mut env, &mut visiting); }
    let mut out = BTreeMap::new();
    for name in values.keys().chain(formulas.keys()) {
        if let Some(v) = env.get(name) { out.insert(name.clone(), to_json(v)); }
    }
    out
}

pub fn number_text(value: f64) -> String {
    if !value.is_finite() || value == 0.0 { return "0".into(); }
    if value.fract() == 0.0 { return format!("{value:.0}"); }
    let mut text = format!("{value:.10}");
    while text.ends_with('0') { text.pop(); }
    if text.ends_with('.') { text.pop(); }
    if text == "-0" { text = "0".into(); }
    text
}

fn grouped(digits: &str) -> String {
    let mut out = String::new();
    for (index, ch) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 { out.push(','); }
        out.push(ch);
    }
    out
}

fn number_body(x: f64, decimals: u32, grouping: bool) -> String {
    let rounded = round_places(fin(x), decimals);
    let fixed = format!("{:.*}", decimals as usize, rounded.abs());
    let (whole, fraction) = match fixed.split_once('.') { Some((w, f)) => (w.to_string(), Some(f.to_string())), None => (fixed, None) };
    let mut out = String::new();
    if rounded < 0.0 { out.push('-'); }
    out.push_str(&if grouping { grouped(&whole) } else { whole });
    if let Some(f) = fraction { out.push('.'); out.push_str(&f); }
    out
}

pub fn format(value: &Value, output: &Value) -> String {
    let decimals = output.get("decimals").and_then(Value::as_u64).unwrap_or(0).min(10) as u32;
    let grouping = output.get("grouping").and_then(Value::as_bool).unwrap_or(false);
    let prefix = output.get("prefix").and_then(Value::as_str).unwrap_or("");
    let suffix = output.get("suffix").and_then(Value::as_str).unwrap_or("");
    let body = match value {
        Value::Number(n) => number_body(n.as_f64().unwrap_or(0.0), decimals, grouping),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    };
    format!("{prefix}{body}{suffix}")
}
