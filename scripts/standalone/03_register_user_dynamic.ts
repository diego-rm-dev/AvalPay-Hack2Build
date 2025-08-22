import { ethers, zkit } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { poseidon3 } from "poseidon-lite";
import type { RegistrationCircuit } from "../../generated-types/zkit";
import { deriveKeysFromUser } from "../../src/utils";

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
    
    const registrarAddress = deploymentData.contracts.registrar;
    
    console.log("🔧 Registering user in Standalone EncryptedERC using zkit...");
    console.log("Registrar:", registrarAddress);
    console.log("User to register:", userAddress);
    
    // Connect to contract using the specific wallet
    const registrar = await ethers.getContractAt("Registrar", registrarAddress, wallet);
    
    // 1. Check if already registered
    const isRegistered = await registrar.isUserRegistered(userAddress);
    if (isRegistered) {
        console.log("✅ User is already registered");
        return;
    }
    
    // 2. Generate deterministic private key from signature using utils
    console.log("🔑 Deriving keys from user signature...");
    const { privateKey, formattedPrivateKey, publicKey, signature } = await deriveKeysFromUser(userAddress, wallet);
    console.log("Private key (raw):", privateKey.toString());
    console.log("Private key (formatted):", formattedPrivateKey.toString());
    console.log("Public key X:", publicKey[0].toString());
    console.log("Public key Y:", publicKey[1].toString());
    
    // 3. Generate registration hash using poseidon3
    const chainId = await ethers.provider.getNetwork().then(net => net.chainId);
    const address = userAddress;
    
    const registrationHash = poseidon3([
        BigInt(chainId),
        formattedPrivateKey,
        BigInt(address),
    ]);
    
    console.log("Chain ID:", chainId.toString());
    console.log("Address:", address);
    console.log("Registration Hash:", registrationHash.toString());
    
    // 4. Generate proof using zkit
    console.log("🔐 Generating registration proof using zkit...");
    try {
        // Get the registration circuit
        const circuit = await zkit.getCircuit("RegistrationCircuit");
        const registrationCircuit = circuit as unknown as RegistrationCircuit;
        
        // Prepare inputs for the circuit
        const input = {
            SenderPrivateKey: formattedPrivateKey,
            SenderPublicKey: [publicKey[0], publicKey[1]],
            SenderAddress: BigInt(address),
            ChainID: BigInt(chainId),
            RegistrationHash: registrationHash,
        };
        
        console.log("📋 Circuit inputs:", input);
        
        // Generate proof
        const proof = await registrationCircuit.generateProof(input);
        console.log("✅ Proof generated successfully using zkit");
        
        // Generate calldata for the contract
        const calldata = await registrationCircuit.generateCalldata(proof);
        console.log("✅ Calldata generated successfully");
        
        // 5. Call the contract
        console.log("📝 Registering in the contract...");
        try {
            const registerTx = await registrar.register(calldata);
            await registerTx.wait();
            
            console.log("✅ User registered successfully!");
        } catch (contractError) {
            console.error("❌ Contract error: ", contractError);
            
            // Extract contract error message
            if (contractError instanceof Error) {
                const errorMessage = contractError.message;
                
                // Look for specific contract error message
                if (errorMessage.includes("execution reverted")) {
                    // Try to extract custom error message
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
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
