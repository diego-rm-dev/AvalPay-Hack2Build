import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { privateBurn } from "../../test/helpers";
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
        
        // Get auditor's public key from contract
        const auditorPublicKey = await encryptedERC.auditorPublicKey();
        console.log("🔑 Auditor public key:", [auditorPublicKey[0].toString(), auditorPublicKey[1].toString()]);
        
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
        
        // Prepare data for burn proof generation
        const userEncryptedBalance = [c1[0], c1[1], c2[0], c2[1]];
        const auditorPublicKeyArray = [BigInt(auditorPublicKey[0].toString()), BigInt(auditorPublicKey[1].toString())];
        
        console.log("🔐 Generating burn proof...");
        console.log("⏳ This may take a while...");
        
        // Generate burn proof using the helper function
        const { proof, userBalancePCT } = await privateBurn(
            user,
            userCurrentBalance,
            burnAmountBigInt,
            userEncryptedBalance,
            auditorPublicKeyArray
        );
        
        console.log("✅ Burn proof generated successfully");
        
        // Debug the proof structure
        console.log("🔍 Debug: burn proof structure:", proof);
        
        // Use the proof directly (since privateBurn returns the correct calldata format)
        const burnProof = proof;
        
        console.log("📝 Submitting burn to contract...");
        
        // Call the contract's privateBurn function
        const burnTx = await encryptedERC.privateBurn(
            burnProof,
            userBalancePCT
        );
        
        console.log("📝 Burn transaction sent:", burnTx.hash);
        
        const receipt = await burnTx.wait();
        console.log("✅ Burn transaction confirmed in block:", receipt?.blockNumber);
        
        console.log("🎉 Private burn completed successfully!");
        
        // Show transaction details from events
        if (receipt) {
            const logs = receipt.logs;
            for (const log of logs) {
                try {
                    const parsed = encryptedERC.interface.parseLog(log);
                    if (parsed && parsed.name === "PrivateBurn") {
                        const [user, auditorPCT, auditorAddress] = parsed.args;
                        console.log("\n📋 Burn Details:");
                        console.log("  - User:", user);
                        console.log("  - Auditor:", auditorAddress);
                        console.log("  - Audit trail created for compliance");
                    }
                } catch (e) {
                    // Skip logs that can't be parsed by this contract
                }
            }
        }
        
        // Show updated balance
        console.log("\n🔍 Checking updated balance...");
        
        // Get user's new balance
        const [newEGCT] = await encryptedERC.balanceOf(userAddress, tokenId);
        const newC1: [bigint, bigint] = [BigInt(newEGCT.c1.x.toString()), BigInt(newEGCT.c1.y.toString())];
        const newC2: [bigint, bigint] = [BigInt(newEGCT.c2.x.toString()), BigInt(newEGCT.c2.y.toString())];
        
        // Check if new balance is empty
        const isNewEGCTEmpty = newC1[0] === 0n && newC1[1] === 0n && newC2[0] === 0n && newC2[1] === 0n;
        let userNewBalance = 0n;
        if (!isNewEGCTEmpty) {
            userNewBalance = decryptEGCTBalance(userPrivateKey, newC1, newC2);
        }
        
        console.log(`💰 User's new balance: ${ethers.formatUnits(userNewBalance, encryptedSystemDecimals)} PRIV`);
        console.log(`🔥 Amount burned: ${ethers.formatUnits(burnAmountBigInt, encryptedSystemDecimals)} PRIV`);
        
        console.log("\n🎯 Burn Summary:");
        console.log(`   User: ${userAddress}`);
        console.log(`   Amount burned: ${ethers.formatUnits(burnAmountBigInt, encryptedSystemDecimals)} PRIV tokens`);
        console.log(`   Remaining balance: ${ethers.formatUnits(userNewBalance, encryptedSystemDecimals)} PRIV tokens`);
        console.log(`   Transaction: ${burnTx.hash}`);
        console.log(`   Status: Tokens permanently destroyed (burned)`);
        
        console.log("\n💡 Next Steps:");
        console.log("   • Check updated balance: npx hardhat run scripts/standalone/06_check_balance_dynamic.ts --network fuji");
        console.log("   • Mint more tokens: npx hardhat run scripts/standalone/05_mint_dynamic.ts --network fuji");
        
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
