import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { decryptEGCTBalance, createUserFromPrivateKey, i0 } from "../../src/utils";

const main = async () => {
    // Get user address from environment variable
    const userAddress = process.env.USER_ADDRESS;
    
    if (!userAddress) {
        throw new Error("❌ USER_ADDRESS environment variable is required");
    }
    
    console.log("💡 Using dynamic values:");
    console.log("   User address:", userAddress);
    
    if (!ethers.isAddress(userAddress)) {
        throw new Error("❌ Invalid user address provided");
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
    
    console.log("🔍 Checking encrypted balance for user...");
    console.log("User address:", userAddress);
    console.log("EncryptedERC:", encryptedERCAddress);
    
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
        
        // Get user's encrypted balance
        console.log("🔍 Getting user's encrypted balance...");
        const [eGCT, nonce, amountPCTs, balancePCT, transactionIndex] = await encryptedERC.balanceOf(userAddress, tokenId);
        
        // Decrypt balance using EGCT
        const c1: [bigint, bigint] = [BigInt(eGCT.c1.x.toString()), BigInt(eGCT.c1.y.toString())];
        const c2: [bigint, bigint] = [BigInt(eGCT.c2.x.toString()), BigInt(eGCT.c2.y.toString())];
        
        const isEGCTEmpty = c1[0] === 0n && c1[1] === 0n && c2[0] === 0n && c2[1] === 0n;
        if (isEGCTEmpty) {
            console.log("💰 Current Balance: 0.0 PRIV");
            console.log("📊 Summary: User has no encrypted balance");
            return;
        }
        
        const encryptedBalance = decryptEGCTBalance(userPrivateKey, c1, c2);
        const encryptedSystemDecimals = 2;
        
        console.log(`💰 Current Balance: ${ethers.formatUnits(encryptedBalance, encryptedSystemDecimals)} PRIV`);
        
        // Show PCTs if they exist
        if (amountPCTs && amountPCTs.length > 0) {
            console.log(`📋 Number of PCTs: ${amountPCTs.length}`);
            
            // Show some PCT details
            for (let i = 0; i < Math.min(amountPCTs.length, 3); i++) {
                const pct = amountPCTs[i];
                if (pct && pct.amount) {
                    console.log(`   PCT ${i + 1}: ${pct.amount.toString()} encrypted units`);
                }
            }
            
            if (amountPCTs.length > 3) {
                console.log(`   ... and ${amountPCTs.length - 3} more PCTs`);
            }
        }
        
        console.log("📊 Summary:");
        console.log(`   Encrypted Balance: ${ethers.formatUnits(encryptedBalance, encryptedSystemDecimals)} PRIV`);
        console.log(`   Transaction Index: ${transactionIndex.toString()}`);
        
    } catch (error) {
        console.error("❌ Error during balance check:");
        console.error(error);
        
        if (error instanceof Error) {
            if (error.message.includes("User not registered")) {
                console.error("💡 Hint: User needs to register first");
            } else if (error.message.includes("InvalidProof")) {
                console.error("💡 Hint: The balance decryption failed - check user keys");
            }
        }
        
        throw error;
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
