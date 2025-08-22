import { ethers, zkit } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { poseidon3 } from "poseidon-lite";
import type { BurnCircuit } from "../../generated-types/zkit";
import { i0, decryptEGCTBalance, createUserFromPrivateKey } from "../../src/utils";

const main = async () => {
    // Get user address and amount from environment variables
    const userAddress = process.env.USER_ADDRESS;
    const burnAmountStr = process.env.AMOUNT;
    
    if (!userAddress) {
        throw new Error("❌ USER_ADDRESS environment variable is required");
    }
    
    if (!burnAmountStr) {
        throw new Error("❌ AMOUNT environment variable is required");
    }
    
    console.log("💡 Using dynamic values:");
    console.log("   User address:", userAddress);
    console.log("   Burn amount:", burnAmountStr);
    
    if (!ethers.isAddress(userAddress)) {
        throw new Error("❌ Invalid user address provided");
    }
    
    const burnAmount = parseFloat(burnAmountStr);
    if (isNaN(burnAmount) || burnAmount <= 0) {
        throw new Error("❌ Invalid burn amount provided");
    }
    
    // Find the signer that matches the user address
    const signers = await ethers.getSigners();
    const wallet = signers.find(signer => 
        signer.address.toLowerCase() === userAddress.toLowerCase()
    );
    
    if (!wallet) {
        throw new Error(`❌ No signer found for address ${userAddress}`);
    }
    
    // Read deployment addresses
    const deploymentPath = path.join(__dirname, "../../deployments/standalone/latest-standalone.json");
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    
    const encryptedERCAddress = deploymentData.contracts.encryptedERC;
    const registrarAddress = deploymentData.contracts.registrar;
    
    console.log("🔥 Burning encrypted tokens in Standalone EncryptedERC...");
    console.log("EncryptedERC:", encryptedERCAddress);
    console.log("User address:", userAddress);
    console.log("Burn amount:", burnAmount);
    
    // Connect to contracts
    const encryptedERC = await ethers.getContractAt("EncryptedERC", encryptedERCAddress, wallet);
    const registrar = await ethers.getContractAt("Registrar", registrarAddress, wallet);
    
    try {
        // Check if user is registered
        const isRegistered = await registrar.isUserRegistered(userAddress);
        if (!isRegistered) {
            console.error("❌ User is not registered. Please run the registration script first.");
            return;
        }
        
        console.log("✅ User is registered");
        
        // Get user's public key from registrar
        const userPublicKey = await registrar.getUserPublicKey(userAddress);
        console.log("🔑 User public key:", [userPublicKey[0].toString(), userPublicKey[1].toString()]);
        
        // Generate user's private key from signature
        const message = `eERC
Registering user with
 Address:${userAddress.toLowerCase()}`;
        const signature = await wallet.signMessage(message);
        const userPrivateKey = i0(signature);
        
        // Create user object
        const user = createUserFromPrivateKey(userPrivateKey, wallet);
        
        // Verify keys match
        const derivedPublicKey = user.publicKey;
        const keysMatch = derivedPublicKey[0] === BigInt(userPublicKey[0].toString()) && 
                         derivedPublicKey[1] === BigInt(userPublicKey[1].toString());
        
        if (!keysMatch) {
            console.error("❌ User's private key doesn't match registered public key!");
            return;
        }
        console.log("✅ User keys verified");
        
        // Get token ID (in standalone, token ID is 1)
        const tokenId = 1n;
        console.log("📋 Token ID:", tokenId.toString());
        
        // Get user's current encrypted balance
        console.log("🔍 Getting user's encrypted balance...");
        const [eGCT, nonce, amountPCTs, balancePCT, transactionIndex] = await encryptedERC.balanceOf(userAddress, tokenId);
        
        // Decrypt user's balance using EGCT
        const c1: [bigint, bigint] = [BigInt(eGCT.c1.x.toString()), BigInt(eGCT.c1.y.toString())];
        const c2: [bigint, bigint] = [BigInt(eGCT.c2.x.toString()), BigInt(eGCT.c2.y.toString())];
        
        const isEGCTEmpty = c1[0] === 0n && c1[1] === 0n && c2[0] === 0n && c2[1] === 0n;
        if (isEGCTEmpty) {
            console.error("❌ User has no encrypted balance to burn");
            return;
        }
        
        const userCurrentBalance = decryptEGCTBalance(userPrivateKey, c1, c2);
        const encryptedSystemDecimals = 2;
        
        console.log(`💰 User's current balance: ${ethers.formatUnits(userCurrentBalance, encryptedSystemDecimals)} encrypted units`);
        
        // Convert burn amount to encrypted system units
        const burnAmountBigInt = BigInt(Math.floor(burnAmount * (10 ** encryptedSystemDecimals)));
        
        if (userCurrentBalance < burnAmountBigInt) {
            console.error(`❌ Insufficient balance. Have: ${ethers.formatUnits(userCurrentBalance, encryptedSystemDecimals)}, Need: ${burnAmount}`);
            return;
        }
        
        console.log(`✅ Burn amount: ${ethers.formatUnits(burnAmountBigInt, encryptedSystemDecimals)} encrypted units`);
        
        // Generate burn hash using poseidon3
        const chainId = await ethers.provider.getNetwork().then(net => net.chainId);
        const burnHash = poseidon3([
            BigInt(chainId),
            userPrivateKey,
            BigInt(userAddress),
            burnAmountBigInt,
        ]);
        
        console.log("Chain ID:", chainId.toString());
        console.log("Burn Hash:", burnHash.toString());
        
        // Generate proof using zkit
        console.log("🔐 Generating burn proof using zkit...");
        try {
            // Get the burn circuit
            const circuit = await zkit.getCircuit("BurnCircuit");
            const burnCircuit = circuit as unknown as BurnCircuit;
            
            // Prepare inputs for the circuit
            const input = {
                SenderPrivateKey: userPrivateKey,
                SenderPublicKey: [user.publicKey[0], user.publicKey[1]],
                SenderAddress: BigInt(userAddress),
                ChainID: BigInt(chainId),
                BurnAmount: burnAmountBigInt,
                BurnHash: burnHash,
            };
            
            console.log("📋 Circuit inputs:", input);
            
            // Generate proof
            const proof = await burnCircuit.generateProof(input);
            console.log("✅ Proof generated successfully using zkit");
            
            // Generate calldata for the contract
            const calldata = await burnCircuit.generateCalldata(proof);
            console.log("✅ Calldata generated successfully");
            
            // Call the contract
            console.log("📝 Burning in the contract...");
            try {
                const burnTx = await encryptedERC.burn(userAddress, tokenId, calldata);
                await burnTx.wait();
                
                console.log("🎉 Burn successful!");
                console.log("Transaction hash:", burnTx.hash);
                
                // Show updated balance
                console.log("\n🔍 Checking updated balance...");
                const [newEGCT] = await encryptedERC.balanceOf(userAddress, tokenId);
                const newC1: [bigint, bigint] = [BigInt(newEGCT.c1.x.toString()), BigInt(newEGCT.c1.y.toString())];
                const newC2: [bigint, bigint] = [BigInt(newEGCT.c2.x.toString()), BigInt(newEGCT.c2.y.toString())];
                const newBalance = decryptEGCTBalance(userPrivateKey, newC1, newC2);
                
                console.log(`💰 New balance: ${ethers.formatUnits(newBalance, encryptedSystemDecimals)} PRIV`);
                console.log(`📤 Amount burned: ${ethers.formatUnits(burnAmountBigInt, encryptedSystemDecimals)} PRIV`);
                
            } catch (contractError) {
                console.error("❌ Contract error: ", contractError);
                
                // Extract contract error message
                if (contractError instanceof Error) {
                    const errorMessage = contractError.message;
                    
                    if (errorMessage.includes("execution reverted")) {
                        const revertMatch = errorMessage.match(/reason: (.+)/);
                        if (revertMatch) {
                            console.error("❌ Contract revert reason:", revertMatch[1]);
                        } else {
                            console.error("❌ Contract execution reverted");
                        }
                    } else {
                        console.error("❌ Contract error:", errorMessage);
                    }
                }
                
                throw contractError;
            }
            
        } catch (proofError) {
            console.error("❌ Proof generation error:", proofError);
            throw proofError;
        }
        
    } catch (error) {
        console.error("❌ Error during burn:");
        console.error(error);
        
        if (error instanceof Error) {
            if (error.message.includes("User not registered")) {
                console.error("💡 Hint: User needs to register first");
            } else if (error.message.includes("Insufficient balance")) {
                console.error("💡 Hint: User doesn't have enough tokens to burn");
            } else if (error.message.includes("InvalidProof")) {
                console.error("💡 Hint: The burn proof verification failed - check inputs");
            }
        }
        
        throw error;
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
