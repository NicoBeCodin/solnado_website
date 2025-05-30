pragma circom 2.0.0;

include "../../../circomlib/circuits/poseidon.circom";
include "../../../circomlib/circuits/bitify.circom";
include "../../../circomlib/circuits/switcher.circom";

template Combine2to2(nLevels) {
    // ── inputs for old leaf #1 ──
    signal input key1;
    signal input val1;
    signal input null1;
    signal input asset1;
    signal input leaf1;
    signal input siblings1[nLevels];

    // ── inputs for old leaf #2 ──
    signal input key2;
    signal input val2;
    signal input null2;
    signal input asset2;
    signal input leaf2;
    signal input siblings2[nLevels];

    // ── new‐leaf private values ──
    signal input newVal1;
    signal input newNull1;
    signal input newVal2;
    signal input newNull2;

    // ── public outputs ──
    signal input newLeaf1;
    signal input newLeaf2;
    signal input root;

    // 1) range checks
    component b1 = Num2Bits(64); b1.in <== val1;
    component b2 = Num2Bits(64); b2.in <== val2;
    component b3 = Num2Bits(64); b3.in <== newVal1;
    component b4 = Num2Bits(64); b4.in <== newVal2;

    component a1 = Num2Bits(32); a1.in <== asset1;
    component a2 = Num2Bits(32); a2.in <== asset2;

    // 2) same asset on all leaves
    asset1 === asset2;

    // 3) recompute old‐leaf #1
    component h1 = Poseidon(3);
    h1.inputs[0] <== val1;
    h1.inputs[1] <== null1;
    h1.inputs[2] <== asset1;
    h1.out      === leaf1;

    // 4) Merkle path #1
    signal sel1[nLevels];
    component bits1 = Num2Bits(nLevels);
    bits1.in <== key1;
    for (var i = 0; i < nLevels; i++) {
        sel1[i] <== bits1.out[nLevels - 1 - i];
    }
    signal path1[nLevels+1];
    path1[0] <== leaf1;

    component sw1[nLevels];
    component lvl1[nLevels];
    for (var i = 0; i < nLevels; i++) {
        sw1[i] = Switcher();
        lvl1[i] = Poseidon(2);

        sw1[i].sel <== sel1[i];
        sw1[i].L   <== path1[i];
        sw1[i].R   <== siblings1[i];

        lvl1[i].inputs[0] <== sw1[i].outL;
        lvl1[i].inputs[1] <== sw1[i].outR;
        path1[i+1]       <== lvl1[i].out;
    }
    path1[nLevels] === root;

    // 5) recompute old‐leaf #2
    component h2 = Poseidon(3);
    h2.inputs[0] <== val2;
    h2.inputs[1] <== null2;
    h2.inputs[2] <== asset2;
    h2.out      === leaf2;

    // 6) Merkle path #2
    signal sel2[nLevels];
    component bits2 = Num2Bits(nLevels);
    bits2.in <== key2;
    for (var i = 0; i < nLevels; i++) {
        sel2[i] <== bits2.out[nLevels - 1 - i];
    }
    signal path2[nLevels+1];
    path2[0] <== leaf2;

    component sw2[nLevels];
    component lvl2[nLevels];
    for (var i = 0; i < nLevels; i++) {
        sw2[i] = Switcher();
        lvl2[i] = Poseidon(2);

        sw2[i].sel <== sel2[i];
        sw2[i].L   <== path2[i];
        sw2[i].R   <== siblings2[i];

        lvl2[i].inputs[0] <== sw2[i].outL;
        lvl2[i].inputs[1] <== sw2[i].outR;
        path2[i+1]       <== lvl2[i].out;
    }
    path2[nLevels] === root;

    // 7) sum invariant
    signal sumOld; sumOld <== val1 + val2;
    signal sumNew; sumNew <== newVal1 + newVal2;
    sumOld === sumNew;

    // 8) new‐leaf #1
    component h3 = Poseidon(3);
    h3.inputs[0] <== newVal1;
    h3.inputs[1] <== newNull1;
    h3.inputs[2] <== asset1;
    h3.out      === newLeaf1;

    // 9) new‐leaf #2
    component h4 = Poseidon(3);
    h4.inputs[0] <== newVal2;
    h4.inputs[1] <== newNull2;
    h4.inputs[2] <== asset1;
    h4.out      === newLeaf2;
}

// expose two old nullifiers, two new leaves, and the root
component main { public [null1, null2, newLeaf1, newLeaf2, root] }
    = Combine2to2(30);
