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




circom public/circuits/WithdrawVariable/WithdrawVariable.circom \
  --r1cs --wasm --sym \
  -o public/circuits/WithdrawVariable

snarkjs groth16 setup \
  public/circuits/WithdrawVariable/WithdrawVariable.r1cs \
  public/circuits/phase2_16.ptau \
  public/circuits/WithdrawVariable/WithdrawVariable_0000.zkey

snarkjs zkey contribute \
  public/circuits/WithdrawVariable/WithdrawVariable_0000.zkey \
  public/circuits/WithdrawVariable/WithdrawVariable.zkey \

snarkjs zkey export verificationkey \
  public/circuits/WithdrawVariable/WithdrawVariable.zkey \
  public/circuits/WithdrawVariable/WithdrawVariable_verification_key.json



circom public/circuits/WithdrawVariable/WithdrawVariable.circom \
  --r1cs --wasm --sym \
  -o public/circuits/WithdrawVariable

snarkjs groth16 setup \
  public/circuits/WithdrawVariable/WithdrawVariable.r1cs \
  public/circuits/phase2_16.ptau \
  public/circuits/WithdrawVariable/WithdrawVariable_0000.zkey

snarkjs zkey contribute \
  public/circuits/WithdrawVariable/WithdrawVariable_0000.zkey \
  public/circuits/WithdrawVariable/WithdrawVariable.zkey \

snarkjs zkey export verificationkey \
  public/circuits/WithdrawVariable/WithdrawVariable.zkey \
  public/circuits/WithdrawVariable/WithdrawVariable_verification_key.json



# 1) Compile the WithdrawAndAdd.circom into R1CS, WASM, and symbol files
circom public/circuits/WithdrawAndAdd/WithdrawAndAdd.circom \
  --r1cs --wasm --sym \
  -o public/circuits/WithdrawAndAdd

# 2) Run the Groth16 “setup” to generate the initial (0000) .zkey
snarkjs groth16 setup \
  public/circuits/WithdrawAndAdd/WithdrawAndAdd.r1cs \
  public/circuits/phase2_16.ptau \
  public/circuits/WithdrawAndAdd/WithdrawAndAdd_0000.zkey

# 3) Contribute to the phase (creates final .zkey)
snarkjs zkey contribute \
  public/circuits/WithdrawAndAdd/WithdrawAndAdd_0000.zkey \
  public/circuits/WithdrawAndAdd/WithdrawAndAdd.zkey 

# 4) Export the on-chain verification key JSON
snarkjs zkey export verificationkey \
  public/circuits/WithdrawAndAdd/WithdrawAndAdd.zkey \
  public/circuits/WithdrawAndAdd/WithdrawAndAdd_verification_key.json


```