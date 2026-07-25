// N104 P2: a late handler from a settled attempt must not remove a later
// attempt's script. Runs the real GDrive IIFE out of src/App.jsx.
import fs from "node:fs"; import vm from "node:vm"; import assert from "node:assert/strict";

const src = fs.readFileSync(process.argv[2] || "src/App.jsx", "utf8");
const start = src.indexOf("const GDrive = (() => {");
const end = src.indexOf("\n})();", start) + "\n})();".length;

const elements = new Map();
const created = [];
const document = {
  getElementById: id => elements.get(id) || null,
  createElement: () => { const el = { _id:null,
      set id(v){ this._id=v; }, get id(){ return this._id; },
      remove(){ if (elements.get(this._id) === this) elements.delete(this._id); this.removed = true; },
      addEventListener(t, fn){ this[`on${t}`] = fn; } };
    created.push(el); return el; },
  head: { appendChild(s){ elements.set(s.id, s); } },
};
const ctx = { console, document, navigator:{onLine:true},
  window:{}, localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  setTimeout, clearTimeout, fetch: async()=>{ throw new Error("no fetch"); }, Date };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + "\nglobalThis.__G = GDrive;", ctx);

// attempt 0 creates S0 and we force its error -> S0 removed, attempt 1 creates S1
const p = ctx.__G.signIn({silent:true}).catch(e=>e);
await new Promise(r=>setTimeout(r,0));
const S0 = created[0];
assert.ok(S0, "attempt 0 created a script");
S0.onerror();                                     // attempt 0 fails, removes S0
await new Promise(r=>setTimeout(r,0));
const S1 = created[1];
assert.ok(S1, "attempt 1 created a fresh script");
assert.equal(elements.get("gis-script"), S1, "S1 is the live script");

// the late handler from the already-settled attempt 0 fires again
S0.onerror();

const still = elements.get("gis-script");
console.log("S0 removed          :", !!S0.removed);
console.log("S1 still in document:", still === S1);
console.log("S1 removed by S0's late handler:", !!S1.removed);
assert.equal(still, S1, "REGRESSION: attempt 1's script was removed by a settled attempt");
assert.ok(!S1.removed, "REGRESSION: S1.remove() was called by a late handler");
console.log("\nP2 PASS: a settled attempt cannot remove a later attempt's script");
