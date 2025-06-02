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
    signal input key1;
    signal input secret1;
    signal input nullifier1;
    signal input nullifierHash1;
    signal input asset1;
    signal input siblings1[nLevels];

    // Leaf #2
    signal input key2;
    signal input secret2;
    signal input nullifier2;
    signal input nullifierHash2;
    signal input asset2;
    signal input siblings2[nLevels];

    // New‐note nullifier (private)
    signal input nullifier3;

    // Public: new leaf commitment + Merkle root
    signal input newLeaf;
    signal input root;

    log("Proving pathes");
    // Verify leaf1 inclusion
    component v1 = Mkt2Verifier(nLevels);
    v1.key           <== key1;
    v1.secret        <== secret1;
    v1.nullifier     <== nullifier1;
    v1.nullifierHash <== nullifierHash1;
    v1.assetId <== asset1;
    v1.root          <== root;
    for (var i = 0; i < nLevels; i++) {
        v1.siblings[i] <== siblings1[i];
    }
    log("Finished path1");

    // Verify leaf2 inclusion
    component v2 = Mkt2Verifier(nLevels);
    v2.key           <== key2;
    v2.secret        <== secret2;
    v2.nullifier     <== nullifier2;
    v2.nullifierHash <== nullifierHash2;
    v2.assetId <== asset2;
    v2.root          <== root;
    for (var i = 0; i < nLevels; i++) {
        v2.siblings[i] <== siblings2[i];
    }
    log("Finished path2");

    // Recompute the two commitments
    component c1 = Poseidon(3);
    c1.inputs[0] <== secret1;
    c1.inputs[1] <== nullifier1;
    c1.inputs[2] <== asset1;

    component c2 = Poseidon(3);
    c2.inputs[0] <== secret2;
    c2.inputs[1] <== nullifier2;
    c2.inputs[2] <== asset2;

    // Private sum of values
    signal sumVal;
    sumVal <== secret1 + secret2;

    // Compute new leaf = Poseidon(sumVal, nullifier3)
    
    component c3 = Poseidon(3);
    c3.inputs[0] <== sumVal;
    c3.inputs[1] <== nullifier3;
    c3.inputs[2] <== asset1;
    
    // Enforce it matches the public newLeaf
    log("New leaf");
    log(newLeaf);
    newLeaf === c3.out;
    asset1 === asset2;
}

// Expose only [nullifier1, nullifier2, newLeaf, root]
component main { public [nullifierHash1, nullifierHash2, newLeaf, root] }
    = CombineCircuit(30);
