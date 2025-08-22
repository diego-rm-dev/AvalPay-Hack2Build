const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando AVALTOOLKIT Standalone System...');

// Función para instalar dependencias si es necesario
async function installDependencies() {
  console.log('📦 Verificando dependencias...');
  
  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: path.join(__dirname),
      stdio: 'inherit',
      shell: true
    });

    npm.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Dependencias instaladas correctamente');
        resolve();
      } else {
        console.error('❌ Error instalando dependencias');
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
  });
}

// Función para iniciar el backend standalone
function startStandaloneBackend() {
  console.log('🔧 Iniciando backend standalone...');
  
  const backend = spawn('node', ['backend/server-standalone.js'], {
    cwd: path.join(__dirname),
    stdio: 'inherit',
    shell: true
  });

  backend.on('error', (error) => {
    console.error('❌ Error iniciando backend standalone:', error);
  });

  backend.on('close', (code) => {
    console.log(`🔧 Backend standalone cerrado con código ${code}`);
  });

  return backend;
}

// Función para iniciar el frontend
function startFrontend() {
  console.log('🎨 Iniciando frontend...');
  
  const frontend = spawn('npm', ['start'], {
    cwd: path.join(__dirname, 'frontend'),
    stdio: 'inherit',
    shell: true
  });

  frontend.on('error', (error) => {
    console.error('❌ Error iniciando frontend:', error);
  });

  frontend.on('close', (code) => {
    console.log(`🎨 Frontend cerrado con código ${code}`);
  });

  return frontend;
}

// Función principal
async function main() {
  try {
    // Instalar dependencias
    await installDependencies();
    
    // Iniciar backend standalone
    const backend = startStandaloneBackend();
    
    // Esperar un poco para que el backend se inicie
    setTimeout(() => {
      // Iniciar frontend
      const frontend = startFrontend();
      
      // Manejar cierre del proceso
      process.on('SIGINT', () => {
        console.log('\n🛑 Cerrando sistema...');
        backend.kill();
        frontend.kill();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.log('\n🛑 Cerrando sistema...');
        backend.kill();
        frontend.kill();
        process.exit(0);
      });
      
    }, 3000);
    
  } catch (error) {
    console.error('❌ Error iniciando sistema:', error);
    process.exit(1);
  }
}

// Iniciar el sistema
main();
