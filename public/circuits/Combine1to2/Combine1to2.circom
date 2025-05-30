pragma circom 2.0.0;

include "../../../circomlib/circuits/poseidon.circom";
include "../../../circomlib/circuits/bitify.circom";
include "../../../circomlib/circuits/switcher.circom";

template Combine1to2(nLevels) {
    // — Inputs —
    signal input key;          // Merkle path key
    signal input val0;         // old leaf value
    signal input null0;        // old leaf nullifier
    signal input asset0;       // old leaf assetId
    signal input leaf0;        // old leaf commitment
    signal input siblings0[nLevels];

    // new leaves (private nullifiers & values)
    signal input val1;
    signal input null1;
    signal input asset1;
    signal input val2;
    signal input null2;
    signal input asset2;
  
    //New leaves
    signal input newLeaf1;
    signal input newLeaf2;
    signal input root;

    // 1) no negatives on any value
    component b0 = Num2Bits(64); b0.in <== val0;
    component b1 = Num2Bits(64); b1.in <== val1;
    component b2 = Num2Bits(64); b2.in <== val2;

    // 2) assetId bounds
    component a0 = Num2Bits(32); a0.in <== asset0;

    // 3) verify old‐leaf commitment = Poseidon3(val0,null0,asset0)
    component h0 = Poseidon(3);
    h0.inputs[0] <== val0;
    h0.inputs[1] <== null0;
    h0.inputs[2] <== asset0;
    h0.out      === leaf0;

    // 4) Merkle‐path inclusion for leaf0
    signal selBits[nLevels];
    component bits = Num2Bits(nLevels);
    bits.in <== key;
    for (var i = 0; i < nLevels; i++) {
        selBits[i] <== bits.out[nLevels - 1 - i];
    }

    signal path0[nLevels + 1];
    path0[0] <== leaf0;

    //predeclare
    component sw[nLevels];
    component lvl[nLevels];
    for (var i = 0; i < nLevels; i++) {
      sw[i]= Switcher();
      lvl[i] = Poseidon(2);
    }
    for (var i = 0; i<nLevels; i++){
        sw[i].sel <== selBits[i];
        sw[i].L   <== path0[i];
        sw[i].R   <== siblings0[i];
        lvl[i].inputs[0] <== sw[i].outL;
        lvl[i].inputs[1] <== sw[i].outR;
        path0[i+1]       <== lvl[i].out;
    }   
    path0[nLevels] === root;
    // 5) sum invariant: val1 + val2 == val0
    signal sum2;
    sum2 <== val1 + val2;
    sum2 === val0;

    // 6) new‐leaf commitments
    component nh1 = Poseidon(3);
    nh1.inputs[0] <== val1;
    nh1.inputs[1] <== null1;
    nh1.inputs[2] <== asset0;
    nh1.out      === newLeaf1;

    component nh2 = Poseidon(3);
    nh2.inputs[0] <== val2;
    nh2.inputs[1] <== null2;
    nh2.inputs[2] <== asset0;
    nh2.out      === newLeaf2;
}

// expose both new nullifiers and new leaves + root as public
component main { public [null0, newLeaf1, newLeaf2, root] }
     = Combine1to2(30);
