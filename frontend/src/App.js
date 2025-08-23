import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

function App() {
  // Estados principales
  const [currentView, setCurrentView] = useState('landing');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOperations, setLoadingOperations] = useState(new Set());
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

  // Función para manejar loading de operaciones específicas
  const setOperationLoading = useCallback((operation, isLoading) => {
    setLoadingOperations(prev => {
      const newSet = new Set(prev);
      if (isLoading) {
        newSet.add(operation);
      } else {
        newSet.delete(operation);
      }
      return newSet;
    });
  }, []);

  // Función para hacer peticiones con timeout extendido
  const fetchWithTimeout = useCallback(async (url, options, timeout = 60000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('La operación tardó demasiado tiempo. Por favor, inténtalo de nuevo.');
      }
      throw error;
    }
  }, []);

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
        
        // Check registration status for both systems
        checkRegistration(address);
        checkRegistrationStandalone(address);
        
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
    
    setOperationLoading('register', true);
    setMessage('Registrando usuario...');
    
    try {
      const response = await fetchWithTimeout('/api/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      }, 45000); // 45 segundos
      
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
      setOperationLoading('register', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Get faucet
  const getFaucet = useCallback(async () => {
    if (!walletAddress) {
      setMessage('Conecta tu wallet primero');
      return;
    }
    
    setOperationLoading('faucet', true);
    setMessage('Obteniendo tokens del faucet...');
    
    try {
      const response = await fetchWithTimeout('/api/get-faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      }, 60000); // 60 segundos para faucet
      
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
      setOperationLoading('faucet', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Check balance
  const checkBalance = useCallback(async () => {
    if (!walletAddress) {
      setMessage('❌ Conecta tu wallet primero');
      return;
    }
    
    setOperationLoading('balance', true);
    setMessage('🔄 Actualizando balance...');
    
    try {
      const response = await fetchWithTimeout('/api/check-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      }, 30000); // 30 segundos para balance
      
      const data = await response.json();
      
      if (data.success) {
        setBalance(data.balance);
        setPrivateBalance(data.privateBalance);
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
      setOperationLoading('balance', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Make deposit
  const makeDeposit = useCallback(async () => {
    const depositAmount = depositInputRef.current?.value || '';
    if (!walletAddress || !depositAmount) {
      setMessage('Conecta tu wallet y especifica un monto');
      return;
    }
    
    setOperationLoading('deposit', true);
    setMessage('Haciendo depósito...');
    
    try {
      const response = await fetchWithTimeout('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: depositAmount })
      }, 90000); // 90 segundos para depósitos
      
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
      setOperationLoading('deposit', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Transfer tokens
  const transferTokens = useCallback(async () => {
    const rawAmount = (transferAmountInputRef.current?.value || (document.getElementById('transfer-amount')?.value || '')).trim();
    const rawTo = (toAddressInputRef.current?.value || (document.getElementById('transfer-to')?.value || '')).trim();

    if (!walletAddress) {
      setMessage('❌ Conecta tu wallet primero');
      return;
    }

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

    setOperationLoading('transfer', true);
    setMessage('Transferiendo tokens...');
    
    try {
      const response = await fetchWithTimeout('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: walletAddress, to: rawTo, amount: rawAmount })
      }, 120000); // 2 minutos para transferencias
      
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
      setOperationLoading('transfer', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Withdraw tokens
  const withdrawTokens = useCallback(async () => {
    const withdrawAmount = withdrawInputRef.current?.value || '';
    if (!walletAddress || !withdrawAmount) {
      setMessage('Conecta tu wallet y especifica un monto');
      return;
    }
    
    setOperationLoading('withdraw', true);
    setMessage('Retirando tokens...');
    
    try {
      const response = await fetchWithTimeout('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: withdrawAmount })
      }, 90000); // 90 segundos para retiros
      
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
      setOperationLoading('withdraw', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // ===== FUNCIONES STANDALONE =====
  
  // Check registration status (Standalone)
  const checkRegistrationStandalone = useCallback(async (address) => {
    if (!address) return;
    
    const cacheKey = `registration_standalone_${address}`;
    const cached = cacheUtils.getMemory(cacheKey) || cacheUtils.getSession(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minutes
      setIsRegistered(cached.value);
      return;
    }
    
    try {
      const response = await fetch('http://localhost:3002/api/check-registration', {
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
      console.error('Error checking registration (standalone):', error);
    }
  }, []);

  // Register user (Standalone)
  const registerUserStandalone = useCallback(async () => {
    if (!walletAddress) {
      setMessage('Conecta tu wallet primero');
      return;
    }
    
    setOperationLoading('register-standalone', true);
    setMessage('Registrando usuario en sistema standalone...');
    
    try {
      const response = await fetchWithTimeout('http://localhost:3002/api/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      }, 45000);
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Usuario registrado exitosamente en sistema standalone');
        setIsRegistered(true);
        addToHistory('Registro Standalone', true);
        
        // Invalidate registration cache
        const cacheKey = `registration_standalone_${walletAddress}`;
        if (window.memoryCache) window.memoryCache.delete(cacheKey);
        sessionStorage.removeItem(cacheKey);
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Registro Standalone', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Registro Standalone', false);
    } finally {
      setOperationLoading('register-standalone', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Check balance (Standalone)
  const checkBalanceStandalone = useCallback(async () => {
    if (!walletAddress) {
      setMessage('❌ Conecta tu wallet primero');
      return;
    }
    
    setOperationLoading('balance-standalone', true);
    setMessage('🔄 Actualizando balance standalone...');
    
    try {
      const response = await fetchWithTimeout('http://localhost:3002/api/check-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      }, 30000);
      
      const data = await response.json();
      
      if (data.success) {
        setPrivateBalance(data.balance);
        setMessage('✅ Balance standalone actualizado exitosamente');
        addToHistory('Verificar Balance Standalone', true);
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Verificar Balance Standalone', false);
      }
    } catch (error) {
      console.error('Error checking balance (standalone):', error);
      setMessage('❌ Error al verificar balance standalone: ' + error.message);
      addToHistory('Verificar Balance Standalone', false);
    } finally {
      setOperationLoading('balance-standalone', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Mint tokens (Standalone)
  const mintTokens = useCallback(async () => {
    const mintAmount = document.getElementById('mint-amount')?.value || '';
    if (!walletAddress || !mintAmount) {
      setMessage('Conecta tu wallet y especifica un monto');
      return;
    }
    
    setOperationLoading('mint', true);
    setMessage('Acuñando tokens...');
    
    try {
      const response = await fetchWithTimeout('http://localhost:3002/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: mintAmount })
      }, 90000);
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Tokens acuñados exitosamente');
        addToHistory('Mint', true);
        if (document.getElementById('mint-amount')) {
          document.getElementById('mint-amount').value = '';
        }
        
        checkBalanceStandalone(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Mint', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Mint', false);
    } finally {
      setOperationLoading('mint', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Transfer tokens (Standalone)
  const transferTokensStandalone = useCallback(async () => {
    const transferAmount = document.getElementById('transfer-amount-standalone')?.value || '';
    const toAddress = document.getElementById('transfer-to-standalone')?.value || '';
    
    if (!walletAddress || !transferAmount || !toAddress) {
      setMessage('❌ Completa todos los campos requeridos');
      return;
    }
    
    const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(toAddress);
    if (!isValidAddress) {
      setMessage('❌ Dirección destino inválida');
      return;
    }
    
    setOperationLoading('transfer-standalone', true);
    setMessage('Transferiendo tokens...');
    
    try {
      const response = await fetchWithTimeout('http://localhost:3002/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: walletAddress, to: toAddress, amount: transferAmount })
      }, 120000);
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Transferencia realizada exitosamente');
        addToHistory('Transferencia Standalone', true);
        if (document.getElementById('transfer-amount-standalone')) {
          document.getElementById('transfer-amount-standalone').value = '';
        }
        if (document.getElementById('transfer-to-standalone')) {
          document.getElementById('transfer-to-standalone').value = '';
        }
        
        checkBalanceStandalone(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Transferencia Standalone', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Transferencia Standalone', false);
    } finally {
      setOperationLoading('transfer-standalone', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Burn tokens (Standalone)
  const burnTokens = useCallback(async () => {
    const burnAmount = document.getElementById('burn-amount')?.value || '';
    if (!walletAddress || !burnAmount) {
      setMessage('Conecta tu wallet y especifica un monto');
      return;
    }
    
    setOperationLoading('burn', true);
    setMessage('Quemando tokens...');
    
    try {
      const response = await fetchWithTimeout('http://localhost:3002/api/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, amount: burnAmount })
      }, 90000);
      
      const data = await response.json();
      
      if (data.success) {
        setMessage('✅ Tokens quemados exitosamente');
        addToHistory('Burn', true);
        if (document.getElementById('burn-amount')) {
          document.getElementById('burn-amount').value = '';
        }
        
        checkBalanceStandalone(); // Refresh balance
      } else {
        setMessage('❌ Error: ' + data.message);
        addToHistory('Burn', false);
      }
    } catch (error) {
      setMessage('❌ Error: ' + error.message);
      addToHistory('Burn', false);
    } finally {
      setOperationLoading('burn', false);
    }
  }, [walletAddress, setOperationLoading, fetchWithTimeout]);

  // Add to history (kept single definition; moved earlier above)

  // Clear cache
  const clearCache = useCallback(() => {
    // Clear memory cache
    if (window.memoryCache) window.memoryCache.clear();
    
    // Clear session storage (only registration cache, balance cache removed)
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('registration_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    setMessage('✅ Cache de registro limpiado');
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
      // Solo verificar balance una vez al conectar
      checkBalance();
      checkBalanceStandalone();
      
      // Configurar intervalo solo para balance del converter
      const interval = setInterval(() => {
        checkBalance();
      }, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isConnected, walletAddress, checkBalance, checkBalanceStandalone]);

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
      
      // Check registration status for both systems if wallet is cached
      if (cachedAddress) {
        checkRegistration(cachedAddress.value);
        checkRegistrationStandalone(cachedAddress.value);
      }
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
            La suite completa de herramientas para el ecosistema Avalanche. 
            Convierte, transfiere y gestiona tokens con privacidad total usando Zero-Knowledge Proofs.
          </p>
          <div className="hero-features">
            <div className="feature-item">
              <div className="feature-icon">🔒</div>
              <span>Privacidad completa con Zero-Knowledge Proofs</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">⚡</div>
              <span>Transacciones instantáneas en Avalanche</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🛡️</div>
              <span>Seguridad de nivel empresarial</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon">🔧</div>
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
            <div className="card-icon">🔄</div>
            <h3>eERC Converter</h3>
            <p>Convierte tokens públicos a privados con encriptación avanzada. Mantén tu privacidad mientras operas en la blockchain.</p>
          </div>
          <div className="floating-card">
            <div className="card-icon">⚡</div>
            <h3>eERC Standalone</h3>
            <p>Tokens nativos encriptados con capacidades completas de mint, transfer y burn. Control total sobre tus activos privados.</p>
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
        <p>Bienvenido a AVALTOOLKIT - Tu centro de control para operaciones privadas en Avalanche</p>
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
            <h3>Operaciones Realizadas</h3>
            <p className="stat-value">{operationHistory.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🛠️</div>
          <div className="stat-content">
            <h3>Herramientas Disponibles</h3>
            <p className="stat-value">2 Sistemas</p>
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
                  {op.success ? '✓' : '✗'}
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
            <div className="operation-layout compact">
              <div className="input-group">
                <label>Estado de registro</label>
                <div className="input-field" style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}>
                  Usuario no registrado
                </div>
              </div>
              <button 
                onClick={registerUser} 
                disabled={loadingOperations.has('register')} 
                className={`operation-button primary ${loadingOperations.has('register') ? 'loading' : ''}`}
              >
                {loadingOperations.has('register') ? 'Registrando...' : 'Registrar Usuario'}
              </button>
            </div>
          ) : (
            <div className="status-success">Usuario registrado</div>
          )}
        </div>

        {/* Balance */}
        <div className="operation-group">
          <h3>Balance</h3>
          <div className="balance-info">
            <p>Balance público: {balance || '0'} AVAXTEST</p>
            <p>Balance privado: {privateBalance || '0'} eAVAXTEST</p>
          </div>
          <div className="operation-layout compact">
            <div className="input-group">
              <label>Última actualización</label>
              <div className="input-field" style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}>
                {new Date().toLocaleTimeString()}
              </div>
            </div>
            <button 
              onClick={checkBalance} 
              disabled={loadingOperations.has('balance')} 
              className={`operation-button secondary ${loadingOperations.has('balance') ? 'loading' : ''}`}
            >
              {loadingOperations.has('balance') ? 'Actualizando...' : 'Actualizar Balance'}
            </button>
          </div>
        </div>

        {/* Faucet */}
        <div className="operation-group">
          <h3>Faucet</h3>
          <div className="operation-layout compact">
            <div className="input-group">
              <label>Tokens disponibles</label>
              <div className="input-field" style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}>
                1000 AVAXTEST por solicitud
              </div>
            </div>
            <button 
              onClick={getFaucet} 
              disabled={loadingOperations.has('faucet')} 
              className={`operation-button primary ${loadingOperations.has('faucet') ? 'loading' : ''}`}
            >
              {loadingOperations.has('faucet') ? 'Obteniendo...' : 'Obtener Tokens'}
            </button>
          </div>
        </div>

        {/* Deposit */}
        <div className="operation-group">
          <h3>Depósito</h3>
          <div className="operation-layout horizontal">
            <div className="input-group">
              <label htmlFor="deposit-amount">Cantidad a depositar</label>
              <input
                id="deposit-amount"
                ref={depositInputRef}
                type="text"
                placeholder="Ej: 10.5"
                onChange={handleAmountChange}
                className="input-field"
                disabled={loadingOperations.has('deposit')}
              />
            </div>
            <button 
              onClick={makeDeposit} 
              disabled={loadingOperations.has('deposit')} 
              className={`operation-button primary ${loadingOperations.has('deposit') ? 'loading' : ''}`}
            >
              {loadingOperations.has('deposit') ? 'Depositando...' : 'Hacer Depósito'}
            </button>
          </div>
        </div>

        {/* Transfer */}
        <div className="operation-group">
          <h3>Transferencia Privada</h3>
          <div className="input-section double">
            <div className="input-group">
              <label htmlFor="transfer-to">Dirección destino</label>
              <input
                id="transfer-to"
                ref={toAddressInputRef}
                type="text"
                placeholder="0x..."
                className="input-field"
                disabled={loadingOperations.has('transfer')}
              />
            </div>
            <div className="input-group">
              <label htmlFor="transfer-amount">Cantidad</label>
              <input
                id="transfer-amount"
                ref={transferAmountInputRef}
                type="text"
                placeholder="Ej: 5.25"
                onChange={handleAmountChange}
                className="input-field"
                disabled={loadingOperations.has('transfer')}
              />
            </div>
          </div>
          <button 
            onClick={transferTokens} 
            disabled={loadingOperations.has('transfer')} 
            className={`operation-button primary ${loadingOperations.has('transfer') ? 'loading' : ''}`}
          >
            {loadingOperations.has('transfer') ? 'Transferiendo...' : 'Transferir'}
          </button>
        </div>

        {/* Withdraw */}
        <div className="operation-group">
          <h3>Retiro</h3>
          <div className="operation-layout horizontal">
            <div className="input-group">
              <label htmlFor="withdraw-amount">Cantidad a retirar</label>
              <input
                id="withdraw-amount"
                ref={withdrawInputRef}
                type="text"
                placeholder="Ej: 5.5"
                onChange={handleAmountChange}
                className="input-field"
                disabled={loadingOperations.has('withdraw')}
              />
            </div>
            <button 
              onClick={withdrawTokens} 
              disabled={loadingOperations.has('withdraw')} 
              className={`operation-button primary ${loadingOperations.has('withdraw') ? 'loading' : ''}`}
            >
              {loadingOperations.has('withdraw') ? 'Retirando...' : 'Retirar Tokens'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Standalone Page Component
  const StandalonePage = () => (
    <div className="standalone-page">
      <div className="page-header">
        <h2>eERC Standalone</h2>
        <p>Tokens nativos encriptados con capacidades de mint/burn</p>
      </div>
      
      <div className="standalone-content">
        {/* Registration */}
        <div className="operation-group">
          <h3>Registro</h3>
          {!isRegistered ? (
            <div className="operation-layout compact">
              <div className="input-group">
                <label>Estado de registro</label>
                <div className="input-field" style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}>
                  Usuario no registrado
                </div>
              </div>
              <button 
                onClick={registerUserStandalone} 
                disabled={loadingOperations.has('register-standalone')} 
                className={`operation-button primary ${loadingOperations.has('register-standalone') ? 'loading' : ''}`}
              >
                {loadingOperations.has('register-standalone') ? 'Registrando...' : 'Registrar Usuario'}
              </button>
            </div>
          ) : (
            <div className="status-success">Usuario registrado</div>
          )}
        </div>

        {/* Balance */}
        <div className="operation-group">
          <h3>Balance</h3>
          <div className="balance-info">
            <p>Balance PRIV: {privateBalance || '0'} PRIV</p>
          </div>
          <div className="operation-layout compact">
            <div className="input-group">
              <label>Última actualización</label>
              <div className="input-field" style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }}>
                {new Date().toLocaleTimeString()}
              </div>
            </div>
            <button 
              onClick={checkBalanceStandalone} 
              disabled={loadingOperations.has('balance-standalone')} 
              className={`operation-button secondary ${loadingOperations.has('balance-standalone') ? 'loading' : ''}`}
            >
              {loadingOperations.has('balance-standalone') ? 'Actualizando...' : 'Actualizar Balance'}
            </button>
          </div>
        </div>

        {/* Mint */}
        <div className="operation-group">
          <h3>Mint Tokens</h3>
          <p className="operation-note">Solo el propietario del contrato puede acuñar tokens</p>
          <div className="operation-layout horizontal">
            <div className="input-group">
              <label htmlFor="mint-amount">Cantidad a acuñar</label>
              <input
                id="mint-amount"
                type="text"
                placeholder="Ej: 100"
                onChange={handleAmountChange}
                className="input-field"
                disabled={loadingOperations.has('mint')}
              />
            </div>
            <button 
              onClick={mintTokens} 
              disabled={loadingOperations.has('mint')} 
              className={`operation-button primary ${loadingOperations.has('mint') ? 'loading' : ''}`}
            >
              {loadingOperations.has('mint') ? 'Acuñando...' : 'Acuñar Tokens'}
            </button>
          </div>
        </div>

        {/* Transfer */}
        <div className="operation-group">
          <h3>Transferencia Privada</h3>
          <div className="input-section double">
            <div className="input-group">
              <label htmlFor="transfer-to-standalone">Dirección destino</label>
              <input
                id="transfer-to-standalone"
                type="text"
                placeholder="0x..."
                className="input-field"
                disabled={loadingOperations.has('transfer-standalone')}
              />
            </div>
            <div className="input-group">
              <label htmlFor="transfer-amount-standalone">Cantidad</label>
              <input
                id="transfer-amount-standalone"
                type="text"
                placeholder="Ej: 50"
                onChange={handleAmountChange}
                className="input-field"
                disabled={loadingOperations.has('transfer-standalone')}
              />
            </div>
          </div>
          <button 
            onClick={transferTokensStandalone} 
            disabled={loadingOperations.has('transfer-standalone')} 
            className={`operation-button primary ${loadingOperations.has('transfer-standalone') ? 'loading' : ''}`}
          >
            {loadingOperations.has('transfer-standalone') ? 'Transferiendo...' : 'Transferir'}
          </button>
        </div>

        {/* Burn */}
        <div className="operation-group">
          <h3>Burn Tokens</h3>
          <p className="operation-note danger">Quemar tokens los destruye permanentemente</p>
          <div className="operation-layout horizontal">
            <div className="input-group">
              <label htmlFor="burn-amount">Cantidad a quemar</label>
              <input
                id="burn-amount"
                type="text"
                placeholder="Ej: 25"
                onChange={handleAmountChange}
                className="input-field"
                disabled={loadingOperations.has('burn')}
              />
            </div>
            <button 
              onClick={burnTokens} 
              disabled={loadingOperations.has('burn')} 
              className={`operation-button danger ${loadingOperations.has('burn') ? 'loading' : ''}`}
            >
              {loadingOperations.has('burn') ? 'Quemando...' : 'Quemar Tokens'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="App">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">AT</div>
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
              Dashboard
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
                  ✓ Conectado
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
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
    </div>
  );
}

export default App;
