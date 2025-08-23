# 🔐 eERC Frontend - Sistema Dinámico

## 🎯 **¿Qué hemos solucionado?**

### ❌ **Problemas Anteriores:**
1. **Números Aleatorios**: El backend simulado usaba valores aleatorios
2. **Scripts Fijos**: Los scripts tenían wallets hardcodeados (1 y 2)
3. **Montos Fijos**: Cantidades quemadas en el código (ej: "50" tokens)
4. **No Dinámico**: No se adaptaba a la dirección de MetaMask del usuario

### ✅ **Solución Implementada:**
1. **Backend Real**: Usa los scripts de Hardhat reales
2. **Scripts Dinámicos**: Modifica los scripts en tiempo real
3. **Montos Personalizables**: El usuario puede elegir cualquier cantidad
4. **Direcciones Dinámicas**: Se adapta a cualquier dirección de MetaMask

## 🚀 **Cómo Usar el Sistema Dinámico**

### **Iniciar Sistema Completo:**
```bash
# Sistema dinámico completo (RECOMENDADO)
npm run dynamic
```

### **Otros Modos Disponibles:**
```bash
# Sistema simple (simulación)
npm run simple

# Solo frontend
npm run frontend-only

# Sistema completo con Hardhat
npm run frontend
```

## 🌐 **Acceso**

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

## 🎨 **Nuevas Características**

### **Campos de Entrada Dinámicos:**
- **Monto**: Ingresa cualquier cantidad de tokens
- **Dirección Destino**: Para transferencias privadas

### **Operaciones Completas:**
- 🔗 **Conectar MetaMask**: Conexión directa y segura
- 🔍 **Verificar Registro**: Comprobar estado real del usuario
- 📝 **Registrar Usuario**: Nuevo registro en el sistema
- 🚰 **Obtener Tokens**: Reclamar del faucet real
- 💰 **Hacer Depósito**: Convertir públicos a privados (monto personalizable)
- 🔄 **Transferir Privadamente**: Transferencias privadas entre usuarios
- 💸 **Retirar Tokens**: Convertir privados a públicos (monto personalizable)
- 📊 **Verificar Balance**: Balances reales (público y privado)

## 🔧 **Cómo Funciona el Sistema Dinámico**

### **1. Modificación de Scripts en Tiempo Real:**
```javascript
// Antes (script fijo):
const WALLET_NUMBER = 1;
const depositAmountStr = "50";

// Después (script dinámico):
const USER_ADDRESS = "0x1234..."; // Dirección de MetaMask
const depositAmountStr = "25";    // Monto del usuario
```

### **2. Proceso de Ejecución:**
1. **Usuario ingresa datos** en el frontend
2. **Backend modifica** el script correspondiente
3. **Ejecuta script real** de Hardhat con datos del usuario
4. **Restaura script original** después de la ejecución
5. **Devuelve resultado real** al frontend

### **3. Scripts Modificados:**
- `03_register-user.ts` → Registro dinámico
- `05_get_faucet.ts` → Faucet dinámico
- `06_deposit.ts` → Depósito con monto personalizable
- `07_transfer.ts` → Transferencia privada dinámica
- `08_check_balance.ts` → Balance real
- `09_withdraw.ts` → Retiro con monto personalizable

## 🎯 **Ventajas del Sistema Dinámico**

### **✅ Para el Usuario:**
- **Montos Personalizables**: Elige cualquier cantidad
- **Direcciones Reales**: Usa su dirección de MetaMask
- **Resultados Reales**: No más números aleatorios
- **Operaciones Completas**: Todas las funciones del sistema eERC

### **✅ Para el Desarrollador:**
- **Scripts Reutilizados**: No reescribe la lógica ZK
- **Mantenimiento Fácil**: Solo modifica scripts existentes
- **Escalabilidad**: Fácil agregar nuevas operaciones
- **Debugging Simple**: Errores en el backend, no en el frontend

## 🔐 **Seguridad Mantenida**

- ✅ **Zero-Knowledge**: Todas las pruebas ZK funcionan
- ✅ **Privacidad**: Los datos sensibles están protegidos
- ✅ **MetaMask**: Transacciones firmadas de forma segura
- ✅ **Sin Almacenamiento**: Las claves nunca se guardan
- ✅ **Scripts Temporales**: Se restauran después de cada uso

## 🚀 **Flujo de Uso Completo**

### **1. Conectar Wallet:**
- Hacer clic en "Conectar MetaMask"
- Asegurarse de estar en Avalanche Fuji Testnet

### **2. Registrar Usuario:**
- Hacer clic en "Registrar Usuario"
- El sistema ejecuta el script real de registro

### **3. Obtener Tokens:**
- Hacer clic en "Obtener Tokens"
- Recibe tokens reales del faucet

### **4. Hacer Depósito:**
- Ingresar monto en el campo "Monto"
- Hacer clic en "Hacer Depósito"
- Convierte tokens públicos a privados

### **5. Transferir Privadamente:**
- Ingresar monto y dirección destino
- Hacer clic en "Transferir Privadamente"
- Transfiere tokens de forma privada

### **6. Retirar Tokens:**
- Ingresar monto a retirar
- Hacer clic en "Retirar Tokens"
- Convierte tokens privados a públicos

## 🛠️ **Troubleshooting**

### **Error: "Script modification failed"**
- Verificar que los scripts existan en `scripts/converter/`
- Asegurarse de que el backend tenga permisos de escritura

### **Error: "Hardhat command failed"**
- Verificar que el sistema esté desplegado
- Ejecutar `npm run zkit:setup` manualmente

### **Error: "User not registered"**
- Registrar el usuario primero
- Verificar que MetaMask esté conectado

### **Error: "Insufficient balance"**
- Obtener tokens del faucet
- Verificar balance antes de operaciones

## 📊 **Comparación de Modos**

| Característica | Simple | Dinámico | Completo |
|----------------|--------|----------|----------|
| **Scripts Reales** | ❌ | ✅ | ✅ |
| **Montos Personalizables** | ❌ | ✅ | ✅ |
| **Direcciones Dinámicas** | ❌ | ✅ | ✅ |
| **Resultados Reales** | ❌ | ✅ | ✅ |
| **Velocidad** | ⚡⚡⚡ | ⚡⚡ | ⚡ |
| **Complejidad** | Baja | Media | Alta |

## 🎉 **¡Resultado Final!**

Ahora tienes un **sistema completamente dinámico** que:
- ✅ **Usa scripts reales** de Hardhat
- ✅ **Permite montos personalizables**
- ✅ **Se adapta a cualquier dirección** de MetaMask
- ✅ **Mantiene toda la privacidad** del sistema original
- ✅ **Es fácil de usar** y mantener
- ✅ **No usa números aleatorios**

**¡El problema de dinamismo está completamente resuelto!** 🚀

## 🚀 **Próximos Pasos**

1. **Probar el sistema**: `npm run dynamic`
2. **Conectar MetaMask** y registrar usuario
3. **Probar operaciones** con montos personalizables
4. **Verificar balances** reales
5. **Realizar transferencias** privadas

**¡Disfruta de tu sistema eERC completamente dinámico!** 🎯
