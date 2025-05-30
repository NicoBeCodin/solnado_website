# To compile the circuits

```zsh

circom public/circuits/Combine2to2/Combine2to2.circom \
  --r1cs --wasm --sym \
  -o public/circuits/Combine2to2

snarkjs groth16 setup \
  public/circuits/Combine2to2/Combine2to2.r1cs \
  public/circuits/phase2_16.ptau \
  public/circuits/Combine2to2/Combine2to2_0000.zkey

snarkjs zkey contribute \
  public/circuits/Combine2to2/Combine2to2_0000.zkey \
  public/circuits/Combine2to2/Combine2to2.zkey

  snarkjs zkey export verificationkey \
  public/circuits/Combine2to2/Combine2to2.zkey \
  public/circuits/Combine2to2/Combine2to2_verification_key.json




circom public/circuits/Combine2to1/Combine2to1.circom \
  --r1cs --wasm --sym \
  -o public/circuits/Combine2to1

snarkjs groth16 setup \
  public/circuits/Combine2to1/Combine2to1.r1cs \
  public/circuits/phase2_16.ptau \
  public/circuits/Combine2to1/Combine2to1_0000.zkey

snarkjs zkey contribute \
  public/circuits/Combine2to1/Combine2to1_0000.zkey \
  public/circuits/Combine2to1/Combine2to1.zkey \


snarkjs zkey export verificationkey \
  public/circuits/Combine2to1/Combine2to1.zkey \
  public/circuits/Combine2to1/Combine2to1_verification_key.json




  circom public/circuits/Combine1to2/Combine1to2.circom \
  --r1cs --wasm --sym \
  -o public/circuits/Combine1to2

snarkjs groth16 setup \
  public/circuits/Combine1to2/Combine1to2.r1cs \
  public/circuits/phase2_16.ptau \
  public/circuits/Combine1to2/Combine1to2_0000.zkey

snarkjs zkey contribute \
  public/circuits/Combine1to2/Combine1to2_0000.zkey \
  public/circuits/Combine1to2/Combine1to2.zkey \


snarkjs zkey export verificationkey \
  public/circuits/Combine1to2/Combine1to2.zkey \
  public/circuits/Combine1to2/Combine1to2_verification_key.json
```