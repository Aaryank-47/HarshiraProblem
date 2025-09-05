#!/usr/bin/env node
// shamir.js

// ---------- Solver code ----------

function parseBigIntInBase(str, base) {
  base = BigInt(base);
  let val = 0n;
  for (const ch of str.trim().toLowerCase()) {
    let digit;
    if (ch >= '0' && ch <= '9') digit = BigInt(ch.charCodeAt(0) - '0'.charCodeAt(0));
    else digit = BigInt(ch.charCodeAt(0) - 'a'.charCodeAt(0) + 10);
    if (digit < 0n || digit >= base) {
      throw new Error(`Invalid digit '${ch}' for base ${base}`);
    }
    val = val * base + digit;
  }
  return val;
}

function bigIntAbs(a) { return a < 0n ? -a : a; }
function bigIntGcd(a, b) {
  a = bigIntAbs(a); b = bigIntAbs(b);
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  return a;
}

class Rational {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error("Zero denominator");
    if (d < 0n) { n = -n; d = -d; }
    const g = bigIntGcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }
  static fromBigInt(x) { return new Rational(x, 1n); }
  add(other) { return new Rational(this.n * other.d + other.n * this.d, this.d * other.d); }
  sub(other) { return new Rational(this.n * other.d - other.n * this.d, this.d * other.d); }
  mul(other) { return new Rational(this.n * other.n, this.d * other.d); }
  div(other) {
    if (other.n === 0n) throw new Error("Division by zero");
    return new Rational(this.n * other.d, this.d * other.n);
  }
}

function lagrangeEvalAt(points, x0) {
  let sum = new Rational(0n, 1n);
  for (let i = 0; i < points.length; i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    let num = new Rational(1n, 1n);
    let den = new Rational(1n, 1n);
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const xj = points[j].x;
      num = num.mul(new Rational(x0 - xj, 1n));
      den = den.mul(new Rational(xi - xj, 1n));
    }
    const li = num.div(den);
    sum = sum.add(Rational.fromBigInt(yi).mul(li));
  }
  return sum;
}

function* combinations(arr, k) {
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k === 0) { yield []; return; }
  while (true) {
    yield idx.map(i => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function solveShamirLike(inputObj) {
  const n = Number(inputObj.keys.n);
  const k = Number(inputObj.keys.k);
  const degree = k - 1;

  const shares = [];
  for (const prop of Object.keys(inputObj)) {
    if (prop === "keys") continue;
    const idx = Number(prop);
    const { base, value } = inputObj[prop];
    const y = parseBigIntInBase(value, Number(base));
    const x = BigInt(idx);
    shares.push({ idx, x, y });
  }
  shares.sort((a, b) => a.idx - b.idx);

  let best = { agreeCount: -1 };

  const indices = shares.map((_, i) => i);
  for (const idxs of combinations(indices, k)) {
    const subset = idxs.map(i => ({ x: shares[i].x, y: shares[i].y }));
    const f0 = lagrangeEvalAt(subset, 0n);
    if (f0.d !== 1n) continue;

    let agreeMask = new Array(n).fill(false);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const xi = shares[i].x;
      const expected = lagrangeEvalAt(subset, xi);
      if (expected.d === 1n && expected.n === shares[i].y) {
        agreeMask[i] = true;
        count++;
      }
    }
    if (count > best.agreeCount) {
      best = { agreeCount: count, secretF0: f0.n, subset: idxs, agrees: agreeMask };
      if (count === n) break;
    }
  }

  const consistent = [], inconsistent = [];
  for (let i = 0; i < n; i++) {
    if (best.agrees[i]) consistent.push(shares[i].idx);
    else inconsistent.push(shares[i].idx);
  }

  return {
    k, degree,
    secretF0: best.secretF0.toString(),
    consistentShareIndices: consistent,
    inconsistentShareIndices: inconsistent
  };
}

// ---------- Input handling ----------

function runWithJson(inputStr) {
  try {
    const parsed = JSON.parse(inputStr);
    const testCases = Array.isArray(parsed) ? parsed : [parsed];

    testCases.forEach((tc, i) => {
      const result = solveShamirLike(tc);
      console.log(`\n=== Test Case ${i + 1} ===`);
      console.log("Secret (f(0)):", result.secretF0);
      console.log("Threshold k:", result.k, " (degree:", result.degree, ")");
      console.log("✔️ Consistent shares:", result.consistentShareIndices);
      console.log("❌ Inconsistent (wrong) shares:", result.inconsistentShareIndices);
    });
  } catch (err) {
    console.error("Error:", err.message);
  }
}

// ---------- CLI Entry ----------

if (process.argv.length > 2) {
  const fs = require("fs");
  const path = process.argv[2];
  const data = fs.readFileSync(path, "utf8");
  runWithJson(data);
} else {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => data += chunk);
  process.stdin.on("end", () => runWithJson(data));
}
