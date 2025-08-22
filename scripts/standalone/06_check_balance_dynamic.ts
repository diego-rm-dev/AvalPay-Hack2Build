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
        
        // Get token ID (in standalone, token ID is 0)
        const tokenId = 0n;
        console.log("📋 Token ID:", tokenId.toString());
        
        // Get user's encrypted balance
        console.log("🔍 Reading encrypted balance from contract...");
        const [eGCT, nonce, amountPCTs, balancePCT, transactionIndex] = await encryptedERC.balanceOf(userAddress, tokenId);
        
        // Decrypt balance using EGCT
        const c1: [bigint, bigint] = [BigInt(eGCT.c1.x.toString()), BigInt(eGCT.c1.y.toString())];
        const c2: [bigint, bigint] = [BigInt(eGCT.c2.x.toString()), BigInt(eGCT.c2.y.toString())];
        
        const isEGCTEmpty = c1[0] === 0n && c1[1] === 0n && c2[0] === 0n && c2[1] === 0n;
        if (isEGCTEmpty) {
            console.log("🔄 EGCT empty or failed, calculating from transaction history...");
            
            // Calculate balance from transaction history
            let totalBalance = 0n;
            let transactionCount = 0;
            
            if (amountPCTs && amountPCTs.length > 0) {
                for (const pct of amountPCTs) {
                    if (pct) {
                        totalBalance += BigInt(pct.toString());
                        transactionCount++;
                    }
                }
            }
            
            const encryptedSystemDecimals = 2;
            console.log(`💰 Current Balance: ${ethers.formatUnits(totalBalance, encryptedSystemDecimals)} PRIV`);
            
            console.log("📋 Transaction History (for compliance/audit):");
            if (amountPCTs && amountPCTs.length > 0) {
                console.log(`  📈 Amount PCTs (${amountPCTs.length} records):`);
                for (let i = 0; i < amountPCTs.length; i++) {
                    const pct = amountPCTs[i];
                    if (pct) {
                        console.log(`    - Transaction ${i + 1}: ${ethers.formatUnits(BigInt(pct.toString()), encryptedSystemDecimals)} PRIV (index: ${i})`);
                    }
                }
            } else {
                console.log("  📝 No Amount PCTs found");
            }
            
            console.log("✅ Balance Check Complete!");
            console.log(`💰 Spendable Balance: ${ethers.formatUnits(totalBalance, encryptedSystemDecimals)} PRIV`);
            console.log(`📋 Transaction Records: ${transactionCount} audit records found`);
            
            console.log("\n💡 Balance Information:");
            console.log(`   • Spendable balance: ${ethers.formatUnits(totalBalance, encryptedSystemDecimals)} PRIV`);
            console.log("   • Balance source: Transaction history");
            console.log(`   • Transaction records: ${transactionCount} audit records found`);
            console.log("   • All data is privately encrypted - only you can decrypt it");
            console.log("   • This balance can be used for transfers and burns");
            
            return;
        }
        
        const encryptedBalance = decryptEGCTBalance(userPrivateKey, c1, c2);
        const encryptedSystemDecimals = 2;
        
        console.log(`🔐 EGCT decryption result: ${encryptedBalance.toString()}`);
        console.log(`💰 Current Balance: ${ethers.formatUnits(encryptedBalance, encryptedSystemDecimals)} PRIV`);
        
        console.log("📋 Transaction History (for compliance/audit):");
        if (balancePCT && balancePCT.amount) {
            console.log(`  📝 Balance PCT: ${ethers.formatUnits(BigInt(balancePCT.amount.toString()), encryptedSystemDecimals)} PRIV`);
        }
        if (amountPCTs && amountPCTs.length > 0) {
            console.log(`  📈 Amount PCTs (${amountPCTs.length} records):`);
            for (let i = 0; i < amountPCTs.length; i++) {
                const pct = amountPCTs[i];
                if (pct) {
                    console.log(`    - Transaction ${i + 1}: ${pct.toString()} (index: ${i})`);
                }
            }
        } else {
            console.log("  📝 No Amount PCTs found");
        }
        
        console.log("✅ Balance Check Complete!");
        console.log(`💰 Spendable Balance: ${ethers.formatUnits(encryptedBalance, encryptedSystemDecimals)} PRIV`);
        console.log(`📋 Transaction Records: ${amountPCTs ? amountPCTs.length : 0} audit records found`);
        
        console.log("\n💡 Balance Information:");
        console.log(`   • Spendable balance: ${ethers.formatUnits(encryptedBalance, encryptedSystemDecimals)} PRIV`);
        console.log("   • Balance source: EGCT encryption");
        console.log(`   • Transaction records: ${amountPCTs ? amountPCTs.length : 0} audit records found`);
        console.log("   • All data is privately encrypted - only you can decrypt it");
        console.log("   • This balance can be used for transfers and burns");
        
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
