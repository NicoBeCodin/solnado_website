pragma circom 2.0.0;

include "../../circomlib/circuits/poseidon.circom";
include "../../circomlib/circuits/bitify.circom";

template DepositCircuit1() {
    // --- private inputs ---
    signal input nullifier;
    signal input assetId;

    // --- public inputs ---
    signal input val;   // ← now public
    signal input leaf;  // Poseidon(val, nullifier, assetId)

    // enforce 0 ≤ val < 2^64
    component b = Num2Bits(64);
    b.in <== val;

    // enforce 0 ≤ assetId < 2^32
    component a = Num2Bits(32);
    a.in <== assetId;

    // Poseidon(3) hash
    component hasher = Poseidon(3);
    hasher.inputs[0] <== val;
    hasher.inputs[1] <== nullifier;
    hasher.inputs[2] <== assetId;

    hasher.out === leaf;
}

// expose both val and leaf as public
component main { public [val, leaf] } = DepositCircuit1();