pragma circom 2.0.0;

include "../../../circomlib/circuits/switcher.circom";
include "../../../circomlib/circuits/poseidon.circom";
include "../../../circomlib/circuits/bitify.circom";

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
    signal input val;
    signal input nullifier;
    signal input nullifierHash;
    signal input assetId;
    signal input root;
    signal input siblings[nLevels];

    component hashV = Poseidon(3);
    hashV.inputs[0] <== val;
    hashV.inputs[1] <== nullifier;
    hashV.inputs[2] <==assetId;
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

template WithdrawCircuit(nLevels) {
    signal input key;
    signal input oldVal;
    component b1 = Num2Bits(64);
    b1.in <== oldVal;
    signal input nullifier;
    signal input nullifierHash;
    signal input assetId;
    signal input root;
    signal input siblings[nLevels];


    signal input withdrawAmount;
    signal input newVal;
    signal input newNull;
    signal input newLeaf;

    signal negWithdraw;
    negWithdraw <== withdrawAmount *-1;
    signal recomputed;
    recomputed <== oldVal + negWithdraw;
    recomputed === newVal;

    component checkOldVal = Num2Bits(64);
    checkOldVal.in <==oldVal;

    component checkNewVal = Num2Bits(64);
    checkNewVal.in <== newVal;

    component hNew = Poseidon(3);
    hNew.inputs[0] <==newVal;
    hNew.inputs[1] <==newNull;
    hNew.inputs[2] <==assetId;
    hNew.out === newLeaf;


    component v = Mkt2Verifier(nLevels);
    v.key           <== key;
    v.val        <== oldVal;
    v.nullifier     <== nullifier;
    v.nullifierHash <== nullifierHash;
    v.assetId <==assetId;
    
    v.root          <== root;
    for (var i = 0; i < nLevels; i++) {
        v.siblings[i] <== siblings[i];
    }
}

    
component main { public [nullifierHash, assetId, withdrawAmount, newLeaf, root] }
    = WithdrawCircuit(30);