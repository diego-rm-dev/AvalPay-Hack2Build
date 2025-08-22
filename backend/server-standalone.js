const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3002; // Puerto diferente al converter

// Cache para setup ZK
let zkSetupCompleted = false;
let zkSetupPromise = null;

// Cache para verificación de registro
const registrationCache = new Map();
const balanceCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const BALANCE_CACHE_DURATION = 2 * 60 * 1000; // 2 minutos

// Middleware
app.use(cors());
app.use(express.json());

// Función para procesar y limpiar mensajes de error
const processErrorMessage = (output) => {
  // Si es un error de registro
  if (output.includes('User is not registered')) {
    return '❌ Usuario no registrado. Por favor regístrate primero.';
  }
  
  // Si es un error de balance insuficiente
  if (output.includes('Insufficient balance') || output.includes('insufficient funds')) {
    return '❌ Saldo insuficiente para realizar esta operación.';
  }
  
  // Si es un error de dirección inválida
  if (output.includes('invalid address') || output.includes('INVALID_ARGUMENT')) {
    return '❌ Dirección de wallet inválida.';
  }
  
  // Si es un error de red
  if (output.includes('network') || output.includes('connection')) {
    return '❌ Error de conexión con la red. Verifica tu conexión a internet.';
  }
  
  // Si es un error de contrato
  if (output.includes('contract') || output.includes('execution reverted')) {
    return '❌ Error en el contrato. La operación no pudo completarse.';
  }
  
  // Si es un error de transacción
  if (output.includes('transaction') || output.includes('gas')) {
    return '❌ Error en la transacción. Verifica que tienes suficiente gas.';
  }
  
  // Si es un error de permisos (solo owner puede mint)
  if (output.includes('Only owner can mint') || output.includes('Ownable')) {
    return '❌ Solo el propietario del contrato puede acuñar tokens.';
  }
  
  // Para otros errores, extraer solo la parte relevante
  const lines = output.split('\n');
  const errorLines = lines.filter(line => 
    line.includes('❌') || 
    line.includes('Error') || 
    line.includes('error') ||
    line.includes('Cannot') ||
    line.includes('Failed')
  );
  
  if (errorLines.length > 0) {
    // Tomar la primera línea de error y limpiarla
    let errorMsg = errorLines[0].replace(/^.*?❌\s*/, '').replace(/^.*?Error:\s*/, '');
    if (errorMsg.length > 100) {
      errorMsg = errorMsg.substring(0, 100) + '...';
    }
    return `❌ ${errorMsg}`;
  }
  
  // Si no se puede procesar, devolver un mensaje genérico
  return '❌ Ocurrió un error inesperado. Intenta nuevamente.';
};

// Función para procesar mensajes de éxito
const processSuccessMessage = (output) => {
  if (output.includes('🎉 Mint successful')) {
    return '✅ Tokens acuñados exitosamente';
  }
  
  if (output.includes('🎉 Transfer successful')) {
    return '✅ Transferencia realizada exitosamente';
  }
  
  if (output.includes('🎉 Burn successful')) {
    return '✅ Tokens quemados exitosamente';
  }
  
  if (output.includes('✅ User is registered')) {
    return '✅ Usuario registrado correctamente';
  }
  
  return '✅ Operación completada exitosamente';
};

// Función para ejecutar setup ZK solo una vez
const ensureZKSetup = () => {
  if (zkSetupCompleted) {
    return Promise.resolve();
  }
  
  if (zkSetupPromise) {
    return zkSetupPromise;
  }
  
  zkSetupPromise = new Promise((resolve, reject) => {
    console.log('🔧 Ejecutando setup de ZK (primera vez)...');
    exec('npm run zkit:setup', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    }, (error) => {
      if (error) {
        console.error('Error en setup ZK:', error);
        reject(error);
        return;
      }
      console.log('✅ Setup ZK completado y cacheado');
      zkSetupCompleted = true;
      resolve();
    });
  });
  
  return zkSetupPromise;
};

// Función para ejecutar comandos de hardhat con scripts dinámicos
const runHardhatCommand = async (scriptPath, userData) => {
  // Asegurar que el setup ZK esté completado (usando cache)
  await ensureZKSetup();
  
  return new Promise((resolve, reject) => {
    const scriptCommand = `npx hardhat run ${scriptPath} --network fuji`;
    
    console.log('🚀 Ejecutando script standalone:', scriptPath);
    exec(scriptCommand, { 
      cwd: path.join(__dirname, '..'),
      env: { 
        ...process.env,
        USER_ADDRESS: userData.address,
        AMOUNT: userData.amount || '',
        TO_ADDRESS: userData.toAddress || ''
      }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error('Error:', error);
        reject(error);
        return;
      }
      
      if (stderr) {
        console.error('Stderr:', stderr);
      }
      
      console.log('Stdout:', stdout);
      resolve(stdout);
    });
  });
};

// API Endpoints

// Verificar registro
app.post('/api/check-registration', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Dirección requerida' 
      });
    }

    // Verificar cache primero
    const cacheKey = `registration_${address.toLowerCase()}`;
    const cached = registrationCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log('📋 Usando cache para verificación de registro:', address);
      return res.json(cached.data);
    }

    console.log('Verificando registro para:', address);
    
    // Usar script dinámico de verificación de balance para verificar registro
    const scriptPath = path.join(__dirname, '../scripts/standalone/06_check-balance.ts');
    
    const output = await runHardhatCommand(scriptPath, { address });
    
    // Verificar si el usuario está registrado basado en el output
    const isRegistered = !output.includes('User is not registered') && 
                        !output.includes('User not registered');
    
    const result = {
      success: true,
      isRegistered,
      message: isRegistered ? 
        '✅ Usuario registrado' : 
        '❌ Usuario no registrado'
    };
    
    // Guardar en cache
    registrationCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error al verificar registro: ' + error.message
    });
  }
});

// Registrar usuario
app.post('/api/register-user', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Dirección requerida' 
      });
    }

    console.log('Registrando usuario:', address);
    
    // Usar script dinámico de registro
    const scriptPath = path.join(__dirname, '../scripts/standalone/03_register-user.ts');
    
    const output = await runHardhatCommand(scriptPath, { address });
    
    const message = processSuccessMessage(output);
    const errorMessage = processErrorMessage(output);
    
    // Verificar si fue exitoso
    if (output.includes('✅ User registered successfully') || 
        output.includes('User is already registered')) {
      res.json({
        success: true,
        message: message
      });
    } else {
      res.json({
        success: false,
        message: errorMessage
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error al registrar: ' + error.message
    });
  }
});

// Verificar balance
app.post('/api/check-balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Dirección requerida' 
      });
    }

    // Verificar cache primero
    const cacheKey = `balance_${address.toLowerCase()}`;
    const cached = balanceCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < BALANCE_CACHE_DURATION) {
      console.log('📋 Usando cache para verificación de balance:', address);
      return res.json(cached.data);
    }

    console.log('Verificando balance para:', address);
    
    // Usar script dinámico de verificación de balance
    const scriptPath = path.join(__dirname, '../scripts/standalone/06_check-balance.ts');
    
    const output = await runHardhatCommand(scriptPath, { address });
    
    // Extraer balances del output usando regex
    const encryptedBalanceMatch = output.match(/Current Balance: ([\d.]+)/);
    const egctBalanceMatch = output.match(/EGCT Balance: ([\d.]+)/);
    
    const encryptedBalance = encryptedBalanceMatch ? encryptedBalanceMatch[1] : 
                            egctBalanceMatch ? egctBalanceMatch[1] : '0';
    
    const message = processSuccessMessage(output);
    const errorMessage = processErrorMessage(output);
    
    if (output.includes('User is not registered')) {
      res.json({
        success: false,
        message: errorMessage
      });
    } else {
      const result = {
        success: true,
        balance: encryptedBalance, // En standalone solo hay balance encriptado
        message: `✅ Balance verificado - Privado: ${encryptedBalance} PRIV`
      };
      
      // Guardar en cache
      balanceCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      res.json(result);
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error al verificar balance: ' + error.message
    });
  }
});

// Acuñar tokens (solo owner)
app.post('/api/mint', async (req, res) => {
  try {
    const { address, amount } = req.body;
    
    if (!address) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Dirección requerida' 
      });
    }

    if (!amount) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Monto requerido' 
      });
    }

    console.log('Acuñando tokens para:', address, 'monto:', amount);
    
    // Usar script dinámico de mint
    const scriptPath = path.join(__dirname, '../scripts/standalone/05_mint.ts');
    
    const output = await runHardhatCommand(scriptPath, { address, amount });
    
    const message = processSuccessMessage(output);
    const errorMessage = processErrorMessage(output);

    if (output.includes('🎉 Mint successful')) {
      // Invalidar cache de balance después de mint
      const cacheKey = `balance_${address.toLowerCase()}`;
      balanceCache.delete(cacheKey);
      
      res.json({
        success: true,
        message: message
      });
    } else {
      res.json({
        success: false,
        message: errorMessage
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error al acuñar tokens: ' + error.message
    });
  }
});

// Transferir tokens
app.post('/api/transfer', async (req, res) => {
  try {
    const address = req.body.address || req.body.from;
    const toAddress = req.body.toAddress || req.body.to;
    const { amount } = req.body;
    
    if (!address || !amount || !toAddress) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Dirección, monto y dirección destino requeridos' 
      });
    }

    console.log('Transferencia de:', address, 'a:', toAddress, 'monto:', amount);
    
    // Usar script dinámico de transferencia
    const scriptPath = path.join(__dirname, '../scripts/standalone/07_transfer.ts');
    
    const output = await runHardhatCommand(scriptPath, { address, amount, toAddress });
    
    const message = processSuccessMessage(output);
    const errorMessage = processErrorMessage(output);

    if (output.includes('🎉 Transfer successful')) {
      // Invalidar cache de balance después de transferencia
      const cacheKey = `balance_${address.toLowerCase()}`;
      balanceCache.delete(cacheKey);
      
      res.json({
        success: true,
        message: message
      });
    } else {
      res.json({
        success: false,
        message: errorMessage
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error en transferencia: ' + error.message
    });
  }
});

// Quemar tokens
app.post('/api/burn', async (req, res) => {
  try {
    const { address, amount } = req.body;
    
    if (!address || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: '❌ Dirección y monto requeridos' 
      });
    }

    console.log('Quemando tokens para:', address, 'monto:', amount);
    
    // Usar script dinámico de burn
    const scriptPath = path.join(__dirname, '../scripts/standalone/08_burn.ts');
    
    const output = await runHardhatCommand(scriptPath, { address, amount });
    
    const message = processSuccessMessage(output);
    const errorMessage = processErrorMessage(output);

    if (output.includes('🎉 Burn successful')) {
      // Invalidar cache de balance después de burn
      const cacheKey = `balance_${address.toLowerCase()}`;
      balanceCache.delete(cacheKey);
      
      res.json({
        success: true,
        message: message
      });
    } else {
      res.json({
        success: false,
        message: errorMessage
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Error al quemar tokens: ' + error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'eERC Standalone Backend funcionando',
    features: [
      'Scripts standalone dinámicos',
      'Sin archivos temporales',
      'Montos personalizables',
      'Direcciones de MetaMask',
      'Operaciones reales de Hardhat',
      'Cache de setup ZK',
      'Cache de verificación de registro',
      'Cache de verificación de balance'
    ],
    cache: {
      registrationCacheSize: registrationCache.size,
      balanceCacheSize: balanceCache.size,
      zkSetupCompleted
    }
  });
});

// Limpiar cache
app.post('/api/clear-cache', (req, res) => {
  registrationCache.clear();
  balanceCache.clear();
  zkSetupCompleted = false;
  zkSetupPromise = null;
  
  res.json({
    success: true,
    message: '✅ Cache limpiado exitosamente'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 eERC Standalone Backend corriendo en puerto ${PORT}`);
  console.log(`📡 API disponible en http://localhost:${PORT}`);
  console.log(`🔧 Modo: Standalone - Scripts dinámicos nativos`);
  console.log(`⚡ Optimizaciones: Sin archivos temporales, Cache ZK, Cache registro, Cache balance`);
  console.log(`💡 Endpoints adicionales: /api/health, /api/clear-cache`);
});
