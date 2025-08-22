import { ethers, zkit } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { poseidon3 } from "poseidon-lite";
import type { MintCircuit } from "../../generated-types/zkit";
import { deriveKeysFromUser } from "../../src/utils";

const main = async () => {
    // Get user address and amount from environment variables
    const userAddress = process.env.USER_ADDRESS;
    const mintAmountStr = process.env.AMOUNT;
    
    if (!userAddress) {
        throw new Error("❌ USER_ADDRESS environment variable is required");
    }
    
    if (!mintAmountStr) {
        throw new Error("❌ AMOUNT environment variable is required");
    }
    
    console.log("💡 Using dynamic values:");
    console.log("   User address:", userAddress);
    console.log("   Mint amount:", mintAmountStr);
    
    if (!ethers.isAddress(userAddress)) {
        throw new Error("❌ Invalid user address provided");
    }
    
    const mintAmount = parseFloat(mintAmountStr);
    if (isNaN(mintAmount) || mintAmount <= 0) {
        throw new Error("❌ Invalid mint amount provided");
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
    
    console.log("🪙 Minting encrypted tokens in Standalone EncryptedERC...");
    console.log("EncryptedERC:", encryptedERCAddress);
    console.log("User address:", userAddress);
    console.log("Mint amount:", mintAmount);
    
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
        const { privateKey, formattedPrivateKey } = await deriveKeysFromUser(userAddress, wallet);
        
        // Create user object
        const user = { privateKey: formattedPrivateKey, publicKey: [BigInt(userPublicKey[0].toString()), BigInt(userPublicKey[1].toString())] };
        
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
        
        // Convert mint amount to encrypted system units
        const encryptedSystemDecimals = 2;
        const mintAmountBigInt = BigInt(Math.floor(mintAmount * (10 ** encryptedSystemDecimals)));
        
        console.log(`✅ Mint amount: ${ethers.formatUnits(mintAmountBigInt, encryptedSystemDecimals)} encrypted units`);
        
        // Generate mint hash using poseidon3
        const chainId = await ethers.provider.getNetwork().then(net => net.chainId);
        const mintHash = poseidon3([
            BigInt(chainId),
            formattedPrivateKey,
            BigInt(userAddress),
            mintAmountBigInt,
        ]);
        
        console.log("Chain ID:", chainId.toString());
        console.log("Mint Hash:", mintHash.toString());
        
        // Generate proof using zkit
        console.log("🔐 Generating mint proof using zkit...");
        try {
            // Get the mint circuit
            const circuit = await zkit.getCircuit("MintCircuit");
            const mintCircuit = circuit as unknown as MintCircuit;
            
            // Prepare inputs for the circuit
            const input = {
                SenderPrivateKey: formattedPrivateKey,
                SenderPublicKey: [user.publicKey[0], user.publicKey[1]],
                SenderAddress: BigInt(userAddress),
                ChainID: BigInt(chainId),
                MintAmount: mintAmountBigInt,
                MintHash: mintHash,
            };
            
            console.log("📋 Circuit inputs:", input);
            
            // Generate proof
            const proof = await mintCircuit.generateProof(input);
            console.log("✅ Proof generated successfully using zkit");
            
            // Generate calldata for the contract
            const calldata = await mintCircuit.generateCalldata(proof);
            console.log("✅ Calldata generated successfully");
            
            // Call the contract
            console.log("📝 Minting in the contract...");
            try {
                const mintTx = await encryptedERC.mint(userAddress, tokenId, calldata);
                await mintTx.wait();
                
                console.log("🎉 Mint successful!");
                console.log("Transaction hash:", mintTx.hash);
                
                // Show updated balance
                console.log("\n🔍 Checking updated balance...");
                const [newEGCT] = await encryptedERC.balanceOf(userAddress, tokenId);
                const newC1: [bigint, bigint] = [BigInt(newEGCT.c1.x.toString()), BigInt(newEGCT.c1.y.toString())];
                const newC2: [bigint, bigint] = [BigInt(newEGCT.c2.x.toString()), BigInt(newEGCT.c2.y.toString())];
                
                // Import decryptEGCTBalance for balance check
                const { decryptEGCTBalance } = await import("../../src/utils");
                const newBalance = decryptEGCTBalance(formattedPrivateKey, newC1, newC2);
                
                console.log(`💰 New balance: ${ethers.formatUnits(newBalance, encryptedSystemDecimals)} PRIV`);
                console.log(`📤 Amount minted: ${ethers.formatUnits(mintAmountBigInt, encryptedSystemDecimals)} PRIV`);
                
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
        console.error("❌ Error during mint:");
        console.error(error);
        
        if (error instanceof Error) {
            if (error.message.includes("User not registered")) {
                console.error("💡 Hint: User needs to register first");
            } else if (error.message.includes("Only owner can mint")) {
                console.error("💡 Hint: Only the contract owner can mint tokens");
            } else if (error.message.includes("InvalidProof")) {
                console.error("💡 Hint: The mint proof verification failed - check inputs");
            }
        }
        
        throw error;
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
