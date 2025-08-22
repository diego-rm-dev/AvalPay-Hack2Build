import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

function App() {
  // Estados principales
  const [currentView, setCurrentView] = useState('landing');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState('');
  const [privateBalance, setPrivateBalance] = useState('');
  const [amount, setAmount] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [operationHistory, setOperationHistory] = useState([]);
  
  // Refs para mantener el foco en los inputs
  const depositInputRef = useRef(null);
  const transferAmountInputRef = useRef(null);
  const withdrawInputRef = useRef(null);
  const toAddressInputRef = useRef(null);

  // Cache utilities
  const cacheUtils = {
    setLocal: (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
      } catch (error) {
        console.warn('Error saving to localStorage:', error);
      }
    },
    
    getLocal: (key) => {
      try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        const { value, timestamp } = JSON.parse(item);
        return { value, timestamp };
      } catch (error) {
        console.warn('Error reading from localStorage:', error);
        return null;
      }
    },
    
    setSession: (key, value) => {
      try {
        sessionStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
      } catch (error) {
        console.warn('Error saving to sessionStorage:', error);
      }
    },
    
    getSession: (key) => {
      try {
        const item = sessionStorage.getItem(key);
        if (!item) return null;
        const { value, timestamp } = JSON.parse(item);
        return { value, timestamp };
      } catch (error) {
        console.warn('Error reading from sessionStorage:', error);
        return null;
      }
    },
    
    setMemory: (key, value) => {
      if (!window.memoryCache) window.memoryCache = new Map();
      window.memoryCache.set(key, { value, timestamp: Date.now() });
    },
    
    getMemory: (key) => {
      if (!window.memoryCache) return null;
      return window.memoryCache.get(key);
    }
  };

  // Add to history (placed early to avoid TDZ in dependent hooks)
  const addToHistory = useCallback((operation, success) => {
    const historyItem = {
      id: Date.now(),
      operation,
      success,
      timestamp: new Date().toLocaleTimeString()
    };
    
    setOperationHistory(prev => [historyItem, ...prev.slice(0, 9)]); // Keep last 10
    
    // Cache history
    cacheUtils.setLocal('operation_history', [historyItem, ...operationHistory.slice(0, 9)]);
  }, [operationHistory]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];
        setWalletAddress(address);
        setIsConnected(true);
        setMessage('✅ Wallet conectada exitosamente');
        
        // Cache wallet connection
        cacheUtils.setLocal('wallet_address', address);
        cacheUtils.setSession('is_connected', true);
        
        // Check registration status
        checkRegistration(address);
        
        // Change to overview
        setCurrentView('overview');
      } catch (error) {
        setMessage('❌ Error conectando wallet: ' + error.message);
      }
    } else {
      setMessage('❌ MetaMask no está instalado');
    }
  }, []);

  // Check registration status
  const checkRegistration = useCallback(async (address) => {
    if (!address) return;
    
    const cacheKey = `registration_${address}`;
    const cached = cacheUtils.getMemory(cacheKey) || cacheUtils.getSession(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minutes
      setIsRegistered(cached.value);
      return;
    }
    
    try {
      const response = await fetch('/api/check-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      
      const data = await response.json();
      setIsRegistered(data.isRegistered);
      
      // Cache result
      cacheUtils.setMemory(cacheKey, data.isRegistered);
      cacheUtils.setSession(cacheKey, data.isRegistered);
    } catch (error) {
      console.error('Error checking registration:', error);
    }
  }, []);

  // Register user
  const registerUser = useCallback(async () => {
    if (!walletAddress) {
      setMessage('Conecta tu wallet primero');
      return;
    }
    
    setLoading(true);
    setMessage('Registrando usuario...');
    
    try {
      const response = await fetch('/api/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Usuario registrado exitosamente');
        setIsRegistered(true);
        addToHistory('Registro', true);
        
        // Invalidate registration cache
        const cacheKey = `registration_${walletAddress}`;
        if (window.memoryCache) window.memoryCache.delete(cacheKey);
        sessionStorage.removeItem(cacheKey);
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Registro', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Registro', false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Get faucet
  const getFaucet = useCallback(async () => {
    if (!walletAddress) {
      setMessage('Conecta tu wallet primero');
      return;
    }
    
    setLoading(true);
    setMessage('Obteniendo tokens del faucet...');
    
    try {
      const response = await fetch('/api/get-faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Tokens obtenidos exitosamente');
        addToHistory('Faucet', true);
        checkBalance(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Faucet', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Faucet', false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Check balance
  const checkBalance = useCallback(async () => {
    if (!walletAddress) {
      setMessage('❌ Conecta tu wallet primero');
      return;
    }
    
    setLoading(true);
    setMessage('🔄 Actualizando balance...');
    
    const cacheKey = `balance_${walletAddress}`;
    const cached = cacheUtils.getMemory(cacheKey) || cacheUtils.getSession(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < 120000) { // 2 minutes
      setBalance(cached.value.public);
      setPrivateBalance(cached.value.private);
      setMessage('✅ Balance actualizado (desde caché)');
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetch('/api/check-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      });
      const data = await response.json();
      
      if (data.success) {
        setBalance(data.balance);
        setPrivateBalance(data.privateBalance);
        
        // Cache result
        const balanceData = { public: data.balance, private: data.privateBalance };
        cacheUtils.setMemory(cacheKey, balanceData);
        cacheUtils.setSession(cacheKey, balanceData);
        
        setMessage('✅ Balance actualizado exitosamente');
        addToHistory('Verificar Balance', true);
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Verificar Balance', false);
      }
    } catch (error) {
      console.error('Error checking balance:', error);
      setMessage('❌ Error al verificar balance: ' + error.message);
      addToHistory('Verificar Balance', false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Make deposit
  const makeDeposit = useCallback(async () => {
    const depositAmount = depositInputRef.current?.value || '';
    if (!walletAddress || !depositAmount) {
      setMessage('Conecta tu wallet y especifica un monto');
      return;
    }
    
    setLoading(true);
    setMessage('Haciendo depósito...');
    
    try {
      const response = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: depositAmount })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Depósito realizado exitosamente');
        addToHistory('Depósito', true);
        if (depositInputRef.current) {
          depositInputRef.current.value = '';
        }
        checkBalance(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Depósito', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Depósito', false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Transfer tokens
  const transferTokens = useCallback(async () => {
    // Leer por ref y fallback por id
    const rawAmount = (transferAmountInputRef.current?.value || (document.getElementById('transfer-amount')?.value || '')).trim();
    const rawTo = (toAddressInputRef.current?.value || (document.getElementById('transfer-to')?.value || '')).trim();

    if (!walletAddress) {
      setMessage('❌ Conecta tu wallet primero');
      return;
    }

    // Log de depuración en cliente
    try { console.log('Transfer debug -> from:', walletAddress, 'to:', rawTo, 'amount:', rawAmount); } catch (_) {}

    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(rawTo);
    if (rawTo && !isValidAddress) {
      setMessage('❌ Dirección destino inválida');
      return;
    }

    const isValidNumber = /^\d*\.?\d+$/.test(rawAmount) && parseFloat(rawAmount) > 0;
    if (rawAmount && !isValidNumber) {
      setMessage('❌ Monto inválido');
      return;
    }

    if (!rawTo || !rawAmount) {
      setMessage('❌ Dirección, monto y dirección destino requeridos');
      return;
    }

    setLoading(true);
    setMessage('Transferiendo tokens...');
    
    try {
      const response = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: walletAddress, to: rawTo, amount: rawAmount })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Transferencia realizada exitosamente');
        addToHistory('Transferencia', true);
        if (transferAmountInputRef.current) {
          transferAmountInputRef.current.value = '';
        }
        if (toAddressInputRef.current) {
          toAddressInputRef.current.value = '';
        }
        checkBalance(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Transferencia', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Transferencia', false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, checkBalance, addToHistory]);

  // Withdraw tokens
  const withdrawTokens = useCallback(async () => {
    const withdrawAmount = withdrawInputRef.current?.value || '';
    if (!walletAddress || !withdrawAmount) {
      setMessage('Conecta tu wallet y especifica un monto');
      return;
    }
    
    setLoading(true);
    setMessage('Retirando tokens...');
    
    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: withdrawAmount })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Retiro realizado exitosamente');
        addToHistory('Retiro', true);
        if (withdrawInputRef.current) {
          withdrawInputRef.current.value = '';
        }
        checkBalance(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Retiro', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Retiro', false);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  // Add to history (kept single definition; moved earlier above)

  // Clear cache
  const clearCache = useCallback(() => {
    // Clear memory cache
    if (window.memoryCache) window.memoryCache.clear();
    
    // Clear session storage
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('balance_') || key.includes('registration_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    setMessage('✅ Cache limpiado');
  }, []);

  // Función simple para validar inputs numéricos sin re-renderizado
  const handleAmountChange = useCallback((e) => {
    const value = e.target.value;
    // Solo permitir números y punto decimal
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      // No hacer nada más, solo permitir el cambio
    } else {
      // Revertir el valor si no es válido
      e.target.value = value.replace(/[^\d.]/g, '');
    }
  }, []);

  // Auto-refresh balance
  useEffect(() => {
    if (isConnected && walletAddress) {
      checkBalance();
      const interval = setInterval(checkBalance, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isConnected, walletAddress, checkBalance]);

  // Load cached data on mount
  useEffect(() => {
    const cachedAddress = cacheUtils.getLocal('wallet_address');
    const cachedConnected = cacheUtils.getSession('is_connected');
    const cachedHistory = cacheUtils.getLocal('operation_history');
    
    if (cachedAddress) {
      setWalletAddress(cachedAddress.value);
    }
    
    if (cachedConnected && cachedConnected.value) {
      setIsConnected(true);
      setCurrentView('overview');
    }
    
    if (cachedHistory) {
      setOperationHistory(cachedHistory.value);
    }
  }, []);

  // Landing Page Component
  const LandingPage = () => (
    <div className="landing-page">
      <div className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="gradient-text">AVALTOOLKIT</span>
          </h1>
          <p className="hero-subtitle">
            La suite completa de herramientas para el ecosistema Avalanche
          </p>
          <div className="hero-features">
            <div className="feature-item">
              <div className="feature-icon">🔒</div>
              <span>Privacidad con Zero-Knowledge Proofs</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">⚡</div>
              <span>Transacciones rápidas y seguras</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🛠️</div>
              <span>Herramientas avanzadas de conversión</span>
            </div>
          </div>
          <button className="cta-button" onClick={connectWallet}>
            <span className="cta-icon">🚀</span>
            Conectar Wallet
          </button>
        </div>
        <div className="hero-visual">
          <div className="floating-card">
            <div className="card-icon">🔐</div>
            <h3>eERC Converter</h3>
            <p>Convierte tokens públicos a privados con encriptación avanzada</p>
          </div>
          <div className="floating-card">
            <div className="card-icon">⚡</div>
            <h3>eERC Standalone</h3>
            <p>Tokens nativos encriptados con capacidades de mint/burn</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Overview Page Component
  const OverviewPage = () => (
    <div className="overview-page">
      <div className="overview-header">
        <h2>Dashboard Overview</h2>
        <p>Bienvenido a AVALTOOLKIT - Tu centro de control para operaciones privadas</p>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🔗</div>
          <div className="stat-content">
            <h3>Estado de Conexión</h3>
            <p className="stat-value">{isConnected ? 'Conectado' : 'Desconectado'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Operaciones</h3>
            <p className="stat-value">{operationHistory.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🛠️</div>
          <div className="stat-content">
            <h3>Herramientas</h3>
            <p className="stat-value">2 Disponibles</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <h3>Rendimiento</h3>
            <p className="stat-value">Optimizado</p>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <h3>Acciones Rápidas</h3>
        <div className="actions-grid">
          <button className="action-button primary" onClick={() => setCurrentView('converter')}>
            <span className="action-icon">🔄</span>
            Ir al Converter
          </button>
          <button className="action-button secondary" onClick={() => setCurrentView('standalone')}>
            <span className="action-icon">⚡</span>
            Ir al Standalone
          </button>
          <button className="action-button secondary" onClick={clearCache}>
            <span className="action-icon">🧹</span>
            Limpiar Cache
          </button>
        </div>
      </div>

      {operationHistory.length > 0 && (
        <div className="recent-activity">
          <h3>Actividad Reciente</h3>
          <div className="activity-list">
            {operationHistory.slice(0, 5).map((op, index) => (
              <div key={index} className={`activity-item ${op.success ? 'success' : 'error'}`}>
                <div className="activity-icon">
                  {op.success ? '✅' : '❌'}
                </div>
                <div className="activity-content">
                  <span className="activity-name">{op.operation}</span>
                  <span className="activity-time">{op.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Converter Page Component
  const ConverterPage = () => (
    <div className="converter-page">
      <div className="page-header">
        <h2>eERC Converter</h2>
        <p>Convierte tokens públicos a privados con encriptación Zero-Knowledge</p>
      </div>
      
      <div className="converter-content">
        {/* Registration */}
        <div className="operation-group">
          <h3>Registro</h3>
          {!isRegistered ? (
            <button onClick={registerUser} disabled={loading} className="operation-button primary">
              {loading ? 'Registrando...' : 'Registrar Usuario'}
            </button>
          ) : (
            <div className="status-success">✅ Usuario registrado</div>
          )}
        </div>

        {/* Balance */}
        <div className="operation-group">
          <h3>Balance</h3>
          <div className="balance-info">
            <p>Balance público: {balance || '0'} AVAXTEST</p>
            <p>Balance privado: {privateBalance || '0'} eAVAXTEST</p>
          </div>
          <button onClick={checkBalance} disabled={loading} className="operation-button secondary">
            {loading ? 'Actualizando...' : 'Actualizar Balance'}
          </button>
        </div>

        {/* Faucet */}
        <div className="operation-group">
          <h3>Faucet</h3>
          <button onClick={getFaucet} disabled={loading} className="operation-button primary">
            {loading ? 'Obteniendo...' : 'Obtener Tokens'}
          </button>
        </div>

                 {/* Deposit */}
         <div className="operation-group">
           <h3>Depósito</h3>
           <div className="input-group">
                                                       <input
                 ref={depositInputRef}
                 type="text"
                 placeholder="Cantidad (ej: 10)"
                 onChange={handleAmountChange}
                 className="input-field"
               />
                           <button onClick={makeDeposit} disabled={loading} className="operation-button primary">
                {loading ? 'Depositando...' : 'Hacer Depósito'}
              </button>
           </div>
         </div>

        {/* Transfer */}
        <div className="operation-group">
          <h3>Transferencia Privada</h3>
          <div className="input-section">
                         <div className="input-group">
               <label>Dirección destino</label>
               <input
                 ref={toAddressInputRef}
                 type="text"
                 placeholder="0x..."
                 className="input-field"
               />
             </div>
                         <div className="input-group">
               <label>Cantidad</label>
                                                               <input
                   ref={transferAmountInputRef}
                   type="text"
                   placeholder="Cantidad (ej: 5)"
                   onChange={handleAmountChange}
                   className="input-field"
                 />
             </div>
          </div>
                                           <button onClick={transferTokens} disabled={loading} className="operation-button primary">
              {loading ? 'Transferiendo...' : 'Transferir'}
            </button>
        </div>

                 {/* Withdraw */}
         <div className="operation-group">
           <h3>Retiro</h3>
           <div className="input-group">
                                                       <input
                 ref={withdrawInputRef}
                 type="text"
                 placeholder="Cantidad (ej: 5)"
                 onChange={handleAmountChange}
                 className="input-field"
               />
                           <button onClick={withdrawTokens} disabled={loading} className="operation-button primary">
                {loading ? 'Retirando...' : 'Retirar Tokens'}
              </button>
           </div>
         </div>
      </div>
    </div>
  );

  // Standalone Page Component
  const StandalonePage = () => (
    <div className="native-page">
      <div className="coming-soon">
        <div className="coming-soon-icon">⚡</div>
        <h2>eERC Standalone</h2>
        <p>Próximamente - Tokens nativos encriptados con capacidades de mint/burn</p>
        
        <div className="features-preview">
          <div className="feature-preview-item">
            <div className="feature-preview-icon">🪙</div>
            <h4>Mint Tokens</h4>
            <p>Crear nuevos tokens encriptados</p>
          </div>
          <div className="feature-preview-item">
            <div className="feature-preview-icon">🔥</div>
            <h4>Burn Tokens</h4>
            <p>Destruir tokens existentes</p>
          </div>
          <div className="feature-preview-item">
            <div className="feature-preview-icon">🔄</div>
            <h4>Transfer Privada</h4>
            <p>Transferencias anónimas</p>
          </div>
        </div>
        
        <button className="notify-button">
          <span>🔔</span>
          Notificarme cuando esté disponible
        </button>
      </div>
    </div>
  );

  return (
    <div className="App">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🛠️</span>
            <span className="logo-text">AVALTOOLKIT</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            ✕
          </button>
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>Navegación</h3>
            <button 
              className={`nav-item ${currentView === 'overview' ? 'active' : ''}`}
              onClick={() => setCurrentView('overview')}
            >
              <span className="nav-icon">📊</span>
              Overview
            </button>
            <button 
              className={`nav-item ${currentView === 'converter' ? 'active' : ''}`}
              onClick={() => setCurrentView('converter')}
            >
              <span className="nav-icon">🔄</span>
              eERC Converter
            </button>
            <button 
              className={`nav-item ${currentView === 'standalone' ? 'active' : ''}`}
              onClick={() => setCurrentView('standalone')}
            >
              <span className="nav-icon">⚡</span>
              eERC Standalone
            </button>
          </div>
          
          {isConnected && (
            <div className="nav-section">
              <h3>Wallet</h3>
              <div className="wallet-info">
                <span className="wallet-address">{walletAddress}</span>
                <span className="wallet-status registered">
                  ✅ Conectado
                </span>
              </div>
            </div>
          )}
          
          <div className="nav-section">
            <h3>Herramientas</h3>
            <button className="nav-item" onClick={clearCache}>
              <span className="nav-icon">🧹</span>
              Limpiar Cache
            </button>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="main-header">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          
          <div className="header-content">
            <h1 className="page-title">
              {currentView === 'landing' && 'AVALTOOLKIT'}
              {currentView === 'overview' && 'Dashboard'}
              {currentView === 'converter' && 'eERC Converter'}
              {currentView === 'standalone' && 'eERC Standalone'}
            </h1>
            
            {!isConnected && currentView !== 'landing' && (
              <button className="connect-wallet-btn" onClick={connectWallet}>
                <span className="btn-icon">🔗</span>
                Conectar Wallet
              </button>
            )}
            
            {isConnected && (
              <div className="wallet-display">
                <span className="wallet-short">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                <span className="status-indicator registered">
                  ✅
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="page-content">
          {currentView === 'landing' && <LandingPage />}
          {currentView === 'overview' && <OverviewPage />}
          {currentView === 'converter' && <ConverterPage />}
          {currentView === 'standalone' && <StandalonePage />}
        </main>

        {/* Message Display */}
        {message && (
          <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
            {message}
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Procesando...</p>
          </div>
        )}
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
    </div>
  );
}

export default App;
