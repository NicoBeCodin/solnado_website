pragma circom 2.0.0;

include "../../circomlib/circuits/poseidon.circom";
include "../../circomlib/circuits/bitify.circom";

template DepositCircuit2() {
    // --- private inputs ---
    signal input val1;
    signal input nullifier1;
    signal input assetId1;

    signal input val2;
    signal input nullifier2;
    signal input assetId2;

    // --- public inputs ---
    signal input sum;    // val1 + val2
    signal input leaf1;  // Poseidon commitment 1
    signal input leaf2;  // Poseidon commitment 2

    // ensure vals are non-negative and < 2^64
    component b1 = Num2Bits(64);
    component b2 = Num2Bits(64);
    b1.in <== val1;
    b2.in <== val2;

    // ensure assetIds are non-negative and < 2^32
    component a1 = Num2Bits(32);
    component a2 = Num2Bits(32);
    a1.in <== assetId1;
    a2.in <== assetId2;

    // optionally enforce same asset type on both leaves:
    assetId1 === assetId2;

    // Poseidon(3) hashes: (val, nullifier, assetId)
    component hasher1 = Poseidon(3);
    component hasher2 = Poseidon(3);

    hasher1.inputs[0] <== val1;
    hasher1.inputs[1] <== nullifier1;
    hasher1.inputs[2] <== assetId1;

    hasher2.inputs[0] <== val2;
    hasher2.inputs[1] <== nullifier2;
    hasher2.inputs[2] <== assetId2;

    // match public leaves
    hasher1.out === leaf1;
    hasher2.out === leaf2;

    // sum check
    signal computedSum;
    computedSum <== val1 + val2;
    computedSum === sum;
}

// expose sum, leaf1, leaf2 as public
component main { public [sum, leaf1, leaf2] } = DepositCircuit2();
