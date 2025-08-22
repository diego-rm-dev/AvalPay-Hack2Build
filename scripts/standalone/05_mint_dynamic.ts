import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { privateMint } from "../../test/helpers";
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
        
        // Get token ID (in standalone, token ID is 0)
        const tokenId = 0n;
        console.log("📋 Token ID:", tokenId.toString());
        
        // Convert mint amount to encrypted system units
        const encryptedSystemDecimals = 2;
        const mintAmountBigInt = BigInt(Math.floor(mintAmount * (10 ** encryptedSystemDecimals)));
        
        console.log(`✅ Mint amount: ${ethers.formatUnits(mintAmountBigInt, encryptedSystemDecimals)} encrypted units`);
        
        // Get auditor's public key
        const auditorPublicKey = await encryptedERC.auditorPublicKey();
        const auditorPublicKeyArray = [BigInt(auditorPublicKey.x.toString()), BigInt(auditorPublicKey.y.toString())];
        console.log("🔑 Auditor public key:", auditorPublicKeyArray.map(k => k.toString()));
        
        // Generate mint proof using helper function
        console.log("🔐 Generating private mint proof...");
        console.log("⏳ This may take a while...");
        
        const mintProof = await privateMint(
            mintAmountBigInt,
            user.publicKey,
            auditorPublicKeyArray
        );
        
        console.log("✅ Mint proof generated successfully");
        
        // Debug the structure
        console.log("🔍 Debug: mintProof type:", typeof mintProof);
        console.log("🔍 Debug: mintProof structure:", mintProof);
        console.log("🔍 Debug: mintProof keys:", Object.keys(mintProof));
        
        // Call the contract's privateMint function
        console.log("📝 Submitting private mint to contract...");
        
        const mintTx = await encryptedERC.privateMint(
            userAddress,
            mintProof
        );
        
        console.log("📝 Mint transaction sent:", mintTx.hash);
        
        const receipt = await mintTx.wait();
        console.log("✅ Private mint transaction confirmed in block:", receipt?.blockNumber);
        
        console.log("🎉 Private mint completed successfully!");
        console.log(`💰 Minted ${ethers.formatUnits(mintAmountBigInt, encryptedSystemDecimals)} PRIV tokens to user ${userAddress}`);
        
        // Show transaction details from events
        if (receipt) {
            const logs = receipt.logs;
            for (const log of logs) {
                try {
                    const parsed = encryptedERC.interface.parseLog(log);
                    if (parsed && parsed.name === "PrivateMint") {
                        const [user, auditorPCT, auditorAddress] = parsed.args;
                        console.log("\n📋 Mint Details:");
                        console.log("  - User:", user);
                        console.log("  - Auditor:", auditorAddress);
                        console.log("  - Audit trail created for compliance");
                    }
                } catch (e) {
                    // Skip logs that can't be parsed by this contract
                }
            }
        }
        
        console.log("\n🎯 Private Mint Summary:");
        console.log(`   From: ${userAddress} (Contract Owner)`);
        console.log(`   To: ${userAddress} (User)`);
        console.log(`   Amount: ${ethers.formatUnits(mintAmountBigInt, encryptedSystemDecimals)} PRIV tokens`);
        console.log(`   Transaction: ${mintTx.hash}`);
        console.log(`   Status: Privately minted (encrypted on-chain)`);
        
        console.log("\n💡 Next Steps:");
        console.log("   • Check encrypted balance: npx hardhat run scripts/standalone/06_check_balance_dynamic.ts --network fuji");
        console.log("   • Transfer privately: npx hardhat run scripts/standalone/07_transfer_dynamic.ts --network fuji");
        console.log("   • Burn tokens: npx hardhat run scripts/standalone/08_burn_dynamic.ts --network fuji");
        
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
