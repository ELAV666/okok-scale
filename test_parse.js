// Run: node test_parse.js   (index.html must be in the same folder)
// Loads the exact CORE block from index.html, so the test checks the same code the app runs.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const core = html.split("// ==CORE START==")[1].split("// ==CORE END==")[0];
const sandbox = { module: { exports: {} }, ArrayBuffer, DataView, Uint8Array, Math, Date, Number, String, Array, Set, Object, isFinite, parseFloat, parseInt };
vm.runInNewContext(core, sandbox);
const C = sandbox.module.exports;

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("✓", name); };
const ios = (cid, hex) => [cid & 0xFF, cid >> 8, ...C.hexToBytes(hex)];   // 15-byte variant

const PACKETS = [
  [0x19C0, "1fe517700a01256065f441a91f", 81.65, true,  600],
  [0x2EC0, "1fbd17700a01256065f441a91f", 81.25, true,  600],
  [0x11C0, "1ee600000a01246065f441a91f", 79.10, false, null],
  [0x19C0, "203a17700a01256065f441a91f", 82.50, true,  600],
];

for (const [cid, hex, w, st, imp] of PACKETS) {
  ok(`0x${cid.toString(16)} ${hex} → ${w} ${st ? "stable" : "measuring"}`, () => {
    const r = C.parseC0(cid, C.hexToBytes(hex));
    assert.deepStrictEqual({ ...r }, { weight: w, impedance: imp, stable: st });
    // DataView input, like Bluefy's event.manufacturerData values
    const dv = new DataView(new Uint8Array(C.hexToBytes(hex)).buffer);
    assert.strictEqual(C.parseC0(cid, dv).weight, w);
    // 15 bytes with the company id still in front
    assert.strictEqual(C.parseC0(cid, ios(cid, hex)).weight, w);
    // v7 strict: other lengths are rejected
    assert.strictEqual(C.parseC0(cid, [0xAA, 0xBB, 0xCC, ...C.hexToBytes(hex)]), null);
  });
}

ok("example packet 203a17700a01256065f441a91f = 82.5 kg stable, imp 600", () => {
  const r = C.parseC0(0x19C0, C.hexToBytes("203a17700a01256065f441a91f"));
  assert.deepStrictEqual({ ...r }, { weight: 82.5, impedance: 600, stable: true });
  assert.strictEqual(C.parseC0(null, C.hexToBytes("203a17700a01256065f441a91f")).weight, 82.5);
  // high byte C0 only (swapped id) is rejected — parse_c0 checks the low byte
  assert.strictEqual(C.parseC0(0xC019, C.hexToBytes("203a17700a01256065f441a91f")), null);
});

ok("rejects wrong company low byte / other MAC / short data", () => {
  assert.strictEqual(C.parseC0(0x1234, C.hexToBytes("1fe517700a01256065f441a91f")), null);
  assert.strictEqual(C.parseC0(0x19C0, C.hexToBytes("1fe517700a0125aabbccddeeff")), null);
  assert.strictEqual(C.parseC0(0x19C0, C.hexToBytes("1fe517700a01")), null);
});

ok("body composition reproduces the Mac history.csv example row", () => {
  const e = { d: "26/10/2026", t: "10:46", w: 81.20, imp: 600 };
  const row = C.csvRow(e, C.DEFAULT_PROFILE).join(",");
  assert.strictEqual(row, "26/10/2026,10:46,81.20,23.0,600,24.8,53.4,59.1,39.7,3.4,11.4,1879,19.4,62.5,18.7,36,50");
});

ok("stability: transient stable 61.25 is NOT saved, 82.50 saved once", () => {
  const d = new C.StabilityDetector(); const saved = [];
  const run = (w, st, a, b) => { for (let t = a; t <= b + 1e-9; t += 0.3) { const s = d.feed({ weight: w, stable: st }, Math.round(t * 1000)); if (s != null) saved.push(s); } };
  run(40, false, 0, 1); run(61.25, true, 1.2, 2.1); run(75, false, 2.4, 5); run(82.5, true, 5.2, 30);
  assert.deepStrictEqual(saved, [82.5]);
  run(0, false, 31, 32);  run(82.6, true, 40, 45);   // stepped off/on within 60 s → deduped
  run(0, false, 46, 47);  run(82.4, true, 100, 105); // > 60 s → saved
  assert.deepStrictEqual(saved, [82.5, 82.4]);
});

ok("CSV import: BOM, quoted header, dd/mm/yyyy, dedupe", () => {
  const csv = C.toCsv([{ d: "26/10/2026", t: "10:46", w: 81.2, imp: 600, ts: 0 }], C.DEFAULT_PROFILE);
  assert.ok(csv.startsWith("\uFEFFתאריך,שעה,\"משקל (ק\"\"ג)\""));
  const rows = C.importCsv(csv);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].w, 81.2);
  const m = C.mergeEntries(rows, C.importCsv(csv));
  assert.strictEqual(m.added, 0);
});

console.log(`\nall ${n} tests passed`);