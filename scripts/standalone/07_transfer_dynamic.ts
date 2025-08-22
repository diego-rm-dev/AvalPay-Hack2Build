import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { privateTransfer } from "../../test/helpers";
import { i0, decryptEGCTBalance, createUserFromPrivateKey } from "../../src/utils";

const main = async () => {
    // Get user address from environment variable
    const userAddress = process.env.USER_ADDRESS;
    const transferAmountStr = process.env.AMOUNT;
    const receiverAddress = process.env.TO_ADDRESS;
    
    if (!userAddress) {
        throw new Error("❌ USER_ADDRESS environment variable is required");
    }
    
    if (!transferAmountStr) {
        throw new Error("❌ AMOUNT environment variable is required");
    }
    
    if (!receiverAddress) {
        throw new Error("❌ TO_ADDRESS environment variable is required");
    }
    
    console.log("💡 Using dynamic values:");
    console.log("   Sender:", userAddress);
    console.log("   Receiver:", receiverAddress);
    console.log("   Amount:", transferAmountStr);
    
    if (!ethers.isAddress(userAddress)) {
        throw new Error("❌ Invalid sender address provided");
    }
    
    if (!ethers.isAddress(receiverAddress)) {
        throw new Error("❌ Invalid receiver address provided");
    }
    
    const transferAmount = parseFloat(transferAmountStr);
    if (isNaN(transferAmount) || transferAmount <= 0) {
        throw new Error("❌ Invalid transfer amount provided");
    }
    
    // Find the signer that matches the user address
    const signers = await ethers.getSigners();
    const senderSigner = signers.find(signer => 
        signer.address.toLowerCase() === userAddress.toLowerCase()
    );
    
    if (!senderSigner) {
        throw new Error(`❌ No signer found for address ${userAddress}`);
    }
    
    const senderAddress = await senderSigner.getAddress();
    
    // Read addresses from the latest deployment
    const deploymentPath = path.join(__dirname, "../../deployments/standalone/latest-standalone.json");
    const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    
    const encryptedERCAddress = deploymentData.contracts.encryptedERC;
    const registrarAddress = deploymentData.contracts.registrar;
    
    console.log("🔄 Performing private transfer...");
    console.log("Sender:", senderAddress);
    console.log("Receiver:", receiverAddress);
    console.log("Amount:", transferAmount);
    console.log("EncryptedERC:", encryptedERCAddress);
    
    // Connect to contracts
    const encryptedERC = await ethers.getContractAt("EncryptedERC", encryptedERCAddress, senderSigner);
    const registrar = await ethers.getContractAt("Registrar", registrarAddress, senderSigner);
    
    try {
        // Check if both sender and receiver are registered
        const isSenderRegistered = await registrar.isUserRegistered(senderAddress);
        const isReceiverRegistered = await registrar.isUserRegistered(receiverAddress);
        
        if (!isSenderRegistered) {
            console.error("❌ Sender is not registered. Please run the registration script first.");
            return;
        }
        if (!isReceiverRegistered) {
            console.error("❌ Receiver is not registered. They need to register first.");
            return;
        }
        
        console.log("✅ Both sender and receiver are registered");
        
        // Load or generate sender's keys
        let senderPrivateKey: bigint;
        let signature: string;
        
        const keysPath = path.join(__dirname, "../../deployments/standalone/user-keys.json");
        if (fs.existsSync(keysPath)) {
            console.log("🔑 Loading sender keys from saved file...");
            const keysData = JSON.parse(fs.readFileSync(keysPath, "utf8"));
            
            if (keysData.userAddress === senderAddress && keysData.keysMatch) {
                senderPrivateKey = BigInt(keysData.privateKey);
                signature = keysData.signature;
                console.log("✅ Sender keys loaded from file");
            } else {
                console.log("⚠️  Saved keys mismatch, generating new signature...");
                const message = `eERC
Registering user with
 Address:${senderAddress.toLowerCase()}`;
                signature = await senderSigner.signMessage(message);
                senderPrivateKey = i0(signature);
            }
        } else {
            console.log("🔐 Generating signature for sender...");
            const message = `eERC
Registering user with
 Address:${senderAddress.toLowerCase()}`;
            signature = await senderSigner.signMessage(message);
            senderPrivateKey = i0(signature);
        }
        
        // Create sender User object
        const sender = createUserFromPrivateKey(senderPrivateKey, senderSigner);
        
        // Get public keys from registrar
        const senderPublicKey = await registrar.getUserPublicKey(senderAddress);
        const receiverPublicKey = await registrar.getUserPublicKey(receiverAddress);
        const auditorPublicKey = await encryptedERC.auditorPublicKey();
        
        console.log("🔑 Sender public key:", [senderPublicKey[0].toString(), senderPublicKey[1].toString()]);
        console.log("🔑 Receiver public key:", [receiverPublicKey[0].toString(), receiverPublicKey[1].toString()]);
        console.log("🔑 Auditor public key:", [auditorPublicKey[0].toString(), auditorPublicKey[1].toString()]);
        
        // Verify sender's keys match
        const derivedSenderPublicKey = sender.publicKey;
        const senderKeysMatch = derivedSenderPublicKey[0] === BigInt(senderPublicKey[0].toString()) && 
                               derivedSenderPublicKey[1] === BigInt(senderPublicKey[1].toString());
        
        if (!senderKeysMatch) {
            console.error("❌ Sender's private key doesn't match registered public key!");
            console.log("Run: npm run fix:keys or npm run register:user");
            return;
        }
        console.log("✅ Sender keys verified");
        
        // Get token ID (in standalone, token ID is 0)
        const tokenId = 0n;
        console.log("📋 Token ID:", tokenId.toString());
        
        // Get sender's current encrypted balance
        console.log("🔍 Getting sender's encrypted balance...");
        const [eGCT, nonce, amountPCTs, balancePCT, transactionIndex] = await encryptedERC.balanceOf(senderAddress, tokenId);
        
        // Decrypt sender's balance using EGCT
        const c1: [bigint, bigint] = [BigInt(eGCT.c1.x.toString()), BigInt(eGCT.c1.y.toString())];
        const c2: [bigint, bigint] = [BigInt(eGCT.c2.x.toString()), BigInt(eGCT.c2.y.toString())];
        
        const isEGCTEmpty = c1[0] === 0n && c1[1] === 0n && c2[0] === 0n && c2[1] === 0n;
        if (isEGCTEmpty) {
            console.error("❌ Sender has no encrypted balance to transfer");
            return;
        }
        
        const senderCurrentBalance = decryptEGCTBalance(senderPrivateKey, c1, c2);
        const encryptedSystemDecimals = 2;
        
        console.log(`💰 Sender's current balance: ${ethers.formatUnits(senderCurrentBalance, encryptedSystemDecimals)} encrypted units`);
        
        // Convert transfer amount to encrypted system units
        const transferAmountBigInt = BigInt(Math.floor(transferAmount * (10 ** encryptedSystemDecimals)));
        
        if (senderCurrentBalance < transferAmountBigInt) {
            console.error(`❌ Insufficient balance. Have: ${ethers.formatUnits(senderCurrentBalance, encryptedSystemDecimals)}, Need: ${transferAmount}`);
            return;
        }
        
        console.log(`✅ Transfer amount: ${ethers.formatUnits(transferAmountBigInt, encryptedSystemDecimals)} encrypted units`);
        
        // Prepare data for transfer proof generation
        const senderEncryptedBalance = [c1[0], c1[1], c2[0], c2[1]];
        const receiverPublicKeyArray = [BigInt(receiverPublicKey[0].toString()), BigInt(receiverPublicKey[1].toString())];
        const auditorPublicKeyArray = [BigInt(auditorPublicKey[0].toString()), BigInt(auditorPublicKey[1].toString())];
        
        console.log("🔐 Generating transfer proof...");
        console.log("This may take a while...");
        
        // Generate transfer proof using the helper function
        const { proof, senderBalancePCT } = await privateTransfer(
            sender,
            senderCurrentBalance,
            receiverPublicKeyArray,
            transferAmountBigInt,
            senderEncryptedBalance,
            auditorPublicKeyArray
        );
        
        console.log("✅ Transfer proof generated successfully");
        
        // The proof returned from privateTransfer is already in the correct format (CalldataTransferCircuitGroth16)
        const transferProof = proof;
        
        console.log("📝 Submitting transfer to contract...");
        
        // Call the contract's transfer function
        const transferTx = await encryptedERC.transfer(
            receiverAddress,
            tokenId,
            transferProof,
            senderBalancePCT
        );
        
        console.log("📝 Transfer transaction sent:", transferTx.hash);
        
        const receipt = await transferTx.wait();
        console.log("✅ Transfer transaction confirmed in block:", receipt?.blockNumber);
        
        console.log("🎉 Private transfer completed successfully!");
        
        // Show updated balances
        console.log("\n🔍 Checking updated balances...");
        
        // Get sender's new balance
        const [newEGCT] = await encryptedERC.balanceOf(senderAddress, tokenId);
        const newC1: [bigint, bigint] = [BigInt(newEGCT.c1.x.toString()), BigInt(newEGCT.c1.y.toString())];
        const newC2: [bigint, bigint] = [BigInt(newEGCT.c2.x.toString()), BigInt(newEGCT.c2.y.toString())];
        const senderNewBalance = decryptEGCTBalance(senderPrivateKey, newC1, newC2);
        
        console.log(`💰 Sender's new balance: ${ethers.formatUnits(senderNewBalance, encryptedSystemDecimals)} encrypted units`);
        console.log(`📤 Amount transferred: ${ethers.formatUnits(transferAmountBigInt, encryptedSystemDecimals)} encrypted units`);
        
        console.log("\n🎯 Transfer Summary:");
        console.log(`   From: ${senderAddress}`);
        console.log(`   To: ${receiverAddress}`);
        console.log(`   Amount: ${transferAmount} tokens`);
        console.log(`   Transaction: ${transferTx.hash}`);
        console.log("\n💡 The receiver can check their balance using npm run check:balance");
        
    } catch (error) {
        console.error("❌ Error during private transfer:");
        console.error(error);
        
        if (error instanceof Error) {
            if (error.message.includes("User not registered")) {
                console.error("💡 Hint: Both sender and receiver must be registered");
            } else if (error.message.includes("Auditor not set")) {
                console.error("💡 Hint: The auditor needs to be set in the EncryptedERC contract");
            } else if (error.message.includes("InvalidProof")) {
                console.error("💡 Hint: The transfer proof verification failed - check inputs");
            }
        }
        
        throw error;
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
