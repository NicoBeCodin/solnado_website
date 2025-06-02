// pragma circom 2.0.0;

// include "../../../circomlib/circuits/switcher.circom";
// include "../../../circomlib/circuits/poseidon.circom";
// include "../../../circomlib/circuits/bitify.circom";

// template Combine1to2(nLevels) {
//     // ─── Old leaf to be nullified ───
//     signal input key;               // Merkle leaf index
//     signal input val0;              // private old value
//     signal input null0;             // private old nullifier
//     signal input nullifierHash0;    // public  Poseidon1(null0)
//     signal input asset0;            // asset ID
//     signal input leaf0;             // public old commitment
//     signal input siblings[nLevels]; // Merkle siblings

//     // ─── New leaves to be created ───
//     signal input val1;   // private new value #1
//     component b1 = Num2Bits(64);
//     b1.in <== val1;
//     signal input null1;  // private new nullifier #1
//     signal input val2;   // private new value #2 
//     component b2 = Num2Bits(64);
//     b2.in <== val2;
//     signal input null2;  // private new nullifier #2

//     // ─── Public outputs ───
//     signal input newLeaf1; // public commit1 = Poseidon3(val1,null1,asset0)
//     signal input newLeaf2; // public commit2 = Poseidon3(val2,null2,asset0)
//     signal input root;     // public updated Merkle root

//     // 1) Recompute and enforce the old nullifier‐hash
//     component nh0 = Poseidon(1);
//     nh0.inputs[0] <== null0;
//     nh0.out      === nullifierHash0;

//     // 2) Range checks
//     component b0 = Num2Bits(64);  b0.in <== val0;
//     // component a0 = Num2Bits(32);  a0.in <== asset0;

//     // 3) Recompute the old leaf’s commitment
//     component h0 = Poseidon(3);
//     h0.inputs[0] <== val0;component a0 = Num2Bits(32);  a0.in <== asset0;
//     h0.inputs[1] <== null0;
//     h0.inputs[2] <== asset0;
//     h0.out      === leaf0;

//     // 4) Merkle‐proof for leaf0
//     signal sel[nLevels];
//     component bits = Num2Bits(nLevels);
//     bits.in <== key;
//     for (var i = 0; i < nLevels; i++) {
//         sel[i] <== bits.out[nLevels - 1 - i];
//     }
//     signal path[nLevels + 1];
//     path[0] <== leaf0;

//     component sw[nLevels];
//     component lvl[nLevels];
//     for (var i = 0; i < nLevels; i++) {
//         sw[i]  = Switcher();
//         lvl[i] = Poseidon(2);

//         sw[i].sel <== sel[i];
//         sw[i].L   <== path[i];
//         sw[i].R   <== siblings[i];

//         lvl[i].inputs[0] <== sw[i].outL;
//         lvl[i].inputs[1] <== sw[i].outR;
//         path[i + 1]      <== lvl[i].out;
//     }
//     path[nLevels] === root;

//     // 5) Enforce sum‐invariant: val1 + val2 == val0
//     signal sumNew; 
//     sumNew <== val1 + val2;
//     sumNew === val0;

//     // 6) Compute the two new leaf commitments with the same asset0
//     component h1 = Poseidon(3);
//     h1.inputs[0] <== val1;
//     h1.inputs[1] <== null1;
//     h1.inputs[2] <== asset0;
//     h1.out      === newLeaf1;

//     component h2 = Poseidon(3);
//     h2.inputs[0] <== val2;
//     h2.inputs[1] <== null2;
//     h2.inputs[2] <== asset0;
//     h2.out      === newLeaf2;
// }

// // Public interface: [nullifierHash0, newLeaf1, newLeaf2, root]
// component main { public [nullifierHash0, newLeaf1, newLeaf2, root] } = Combine1to2(30);


pragma circom 2.0.0;

include "../../../circomlib/circuits/switcher.circom";
include "../../../circomlib/circuits/poseidon.circom";
include "../../../circomlib/circuits/bitify.circom";

///
/// One step of Merkle‐path hashing with a switcher
///

template Mkt2VerifierLevel() {
    signal input sibling;
    signal input low;
    signal input selector;
    signal output root;

    component sw = Switcher();
    component hash = Poseidon(2);

    sw.sel <== selector;
    sw.L <== low;
    sw.R <== sibling;

    log(sw.outL);
    log(sw.outR);

    hash.inputs[0] <== sw.outL;
    hash.inputs[1] <== sw.outR;

    root <== hash.out;
}

template Mkt2Verifier(nLevels) {

    signal input key;
    signal input secret;
    signal input nullifier;
    signal input nullifierHash;
    signal input assetId;
    signal input root;
    signal input siblings[nLevels];

    component hashV = Poseidon(3);
    hashV.inputs[0] <== secret;
    hashV.inputs[1] <== nullifier;
    hashV.inputs[2] <== assetId;

    component hashNullifier = Poseidon(1);
    hashNullifier.inputs[0] <== nullifier;

    component n2b = Num2Bits(nLevels);
    component levels[nLevels];

    n2b.in <== key;

    for (var i=nLevels-1; i>=0; i--) {
        levels[i] = Mkt2VerifierLevel();
        levels[i].sibling <== siblings[i];
        // levels[i].selector <== n2b.out[i];
        levels[i].selector <== n2b.out[nLevels - 1 - i];
        if (i==nLevels-1) {
            levels[i].low <== hashV.out;
        }
        else {
            levels[i].low <== levels[i+1].root;
        }
        log("i: ",i);
        log("siblings[i] : ",siblings[i]);
    }

    log("levels[0].root : ", levels[0].root);
    log("public signal root", root);
    

    root === levels[0].root;
    hashNullifier.out === nullifierHash;
}

///
/// Combine‐and‐append circuit:
/// prove you know two leaves whose sum is a third.
/// Public signals: nullifierHash1, nullifierHash2, sumLeaf, root
///
template CombineCircuit(nLevels) {
    // Leaf #1
    signal input key;               // Merkle leaf index
    signal input val0;              // private old value
    signal input null0;             // private old nullifier
    signal input nullifierHash0;    // public  Poseidon1(null0)
    signal input asset0;            // asset ID
    signal input leaf0;             // public old commitment
    signal input siblings[nLevels]; // Merkle siblings

    // ─── New leaves to be created ───
    signal input val1;   // private new value #1
    component b1 = Num2Bits(64);
    b1.in <== val1;
    signal input null1;  // private new nullifier #1
    signal input val2;   // private new value #2 
    component b2 = Num2Bits(64);
    b2.in <== val2;
    signal input null2;  // private new nullifier #2

    // ─── Public outputs ───
    signal input newLeaf1; // public commit1 = Poseidon3(val1,null1,asset0)
    signal input newLeaf2; // public commit2 = Poseidon3(val2,null2,asset0)
    signal input root;     // public updated Merkle root


    log("Proving path1");
    // Verify leaf1 inclusion
    component v1 = Mkt2Verifier(nLevels);
    v1.key           <== key;
    v1.secret        <== val0;
    v1.nullifier     <== null0;
    v1.nullifierHash <== nullifierHash0;
    v1.assetId <== asset0;
    v1.root          <== root;
    for (var i = 0; i < nLevels; i++) {
        v1.siblings[i] <== siblings[i];
    }
    log("Finished path1");

    //Recompute old leaf
    component h0 = Poseidon(3);
    h0.inputs[0] <==val0;
    h0.inputs[1] <==null0;
    h0.inputs[2] <==asset0;
    h0.out=== leaf0;

    // Recompute the two commitments
    component c1 = Poseidon(3);
    c1.inputs[0] <== val1;
    c1.inputs[1] <== null1;
    c1.inputs[2] <== asset0;
    c1.out === newLeaf1;

    component c2 = Poseidon(3);
    c2.inputs[0] <== val2;
    c2.inputs[1] <== null2;
    c2.inputs[2] <== asset0;
    c2.out === newLeaf2;

    // Private sum of values
    signal sumNew;
    sumNew <== val1+ val2;
    sumNew === val0;
    
    // Enforce it matches the public newLeaf
    
    
    
}

// Expose only [nullifier1, nullifier2, newLeaf, root]
component main {public [nullifierHash0, newLeaf1, newLeaf2, root]}
    = CombineCircuit(30);
