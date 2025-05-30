#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

const PTauFilename = "phase2_16.ptau";
// const PTauUrl =
//   "https://hermez.s3-eu-west-1.amazonaws.com/" + PTauFilename;

// list your circuit names (matching folders under public/circuits)
const circuits = ["Combine2to1", "Combine1to2", "Combine2to2"];

async function ensurePTau(outDir) {
  const dst = path.join(outDir, PTauFilename);
  if (fs.existsSync(dst)) return dst;
  console.log(`→ Downloading ${PTauFilename} to ${outDir}…`);
  const res = await fetch(PTauUrl);
  if (!res.ok) throw new Error(`Failed to download PTau: ${res.status}`);
  const fileStream = fs.createWriteStream(dst);
  await new Promise((r, e) => {
    res.body.pipe(fileStream);
    res.body.on("error", e);
    fileStream.on("finish", r);
  });
  return dst;
}

async function compileCircuit(name) {
  const dir = path.join("public", "circuits", name);
  const circomPath = path.join(dir, `${name}.circom`);
  if (!fs.existsSync(circomPath)) {
    throw new Error(`Circuit file not found: ${circomPath}`);
  }

  console.log(`\n🔨 Compiling ${name}…`);
  execSync(
    `circom ${circomPath} --r1cs --wasm --sym -o ${dir}`,
    { stdio: "inherit" }
  );

  // get the right .r1cs path
  const r1cs = path.join(dir, `${name}.r1cs`);
  const wasm = path.join(dir, `${name}_js`, `${name}.wasm`);

  // ensure ptau
  const ptau = "phase2_";

  // 1) setup
  const zkey0 = path.join(dir, `${name}_0000.zkey`);
  const zkey  = path.join(dir, `${name}.zkey`);
  console.log(`⛓  Running Groth16 setup for ${name}…`);
  execSync(
    `snarkjs groth16 setup ${r1cs} ${ptau} ${zkey0}`,
    { stdio: "inherit" }
  );

  // 2) contribute
  console.log(`🎁 Contributing to zkey for ${name}…`);
  execSync(
    `snarkjs zkey contribute ${zkey0} ${zkey} -n "First contribution" -v`,
    { stdio: "inherit" }
  );

  // 3) export verification key
  const vkey = path.join(dir, `${name}_verification_key.json`);
  console.log(`🔑 Exporting verification key for ${name}…`);
  execSync(
    `snarkjs zkey export verificationkey ${zkey} ${vkey}`,
    { stdio: "inherit" }
  );

  console.log(`✅ ${name} complete`);
}

(async () => {
  for (const c of circuits) {
    await compileCircuit(c);
  }
  console.log("\nAll circuits compiled and keys generated 🎉");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});