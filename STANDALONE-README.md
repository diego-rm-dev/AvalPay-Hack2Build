# 🏦 eERC Standalone System - Backend Separado

Este documento describe el sistema **Standalone** de eERC, que es completamente independiente del sistema Converter.

## 🚀 **Características del Sistema Standalone**

### **🏦 Modo Standalone (Tokens Nativos Encriptados)**
- **Tokens Nativos PRIV**: Crea tokens encriptados nativos (no wrapped ERC20s)
- **Sistema Mint/Burn**: Modelo de banco central con suministro controlado
- **Token Único**: Ecosistema de tokens encriptados autónomo
- **Caso de Uso**: CBDC (Moneda Digital del Banco Central), emisión de tokens privados

## 📋 **Arquitectura del Sistema**

### **Backend Separado**
- **Puerto**: 3002 (diferente al Converter que usa 3001)
- **Archivo**: `backend/server-standalone.js`
- **Scripts**: `scripts/standalone/*_dynamic.ts`

### **Scripts Dinámicos Disponibles**
1. `03_register_user_dynamic.ts` - Registro de usuarios
2. `06_check_balance_dynamic.ts` - Verificación de balance
3. `05_mint_dynamic.ts` - Acuñar tokens (solo owner)
4. `07_transfer_dynamic.ts` - Transferencia privada
5. `08_burn_dynamic.ts` - Quemar tokens

## 🚀 **Inicio Rápido**

### **1. Iniciar el Sistema Standalone**
```bash
npm run standalone
```

Esto iniciará:
- Backend standalone en puerto 3002
- Frontend en puerto 3000
- Setup automático de ZK

### **2. Verificar que el Backend Funciona**
```bash
curl http://localhost:3002/api/health
```

Deberías ver:
```json
{
  "status": "OK",
  "message": "eERC Standalone Backend funcionando",
  "features": [
    "Scripts standalone dinámicos",
    "Sin archivos temporales",
    "Montos personalizables",
    "Direcciones de MetaMask",
    "Operaciones reales de Hardhat",
    "Cache de setup ZK",
    "Cache de verificación de registro",
    "Cache de verificación de balance"
  ]
}
```

## 📡 **Endpoints del API Standalone**

### **Registro y Verificación**
- `POST /api/check-registration` - Verificar si usuario está registrado
- `POST /api/register-user` - Registrar nuevo usuario

### **Balance**
- `POST /api/check-balance` - Verificar balance encriptado

### **Operaciones de Tokens**
- `POST /api/mint` - Acuñar tokens (solo owner)
- `POST /api/transfer` - Transferir tokens privadamente
- `POST /api/burn` - Quemar tokens

### **Utilidades**
- `GET /api/health` - Estado del sistema
- `POST /api/clear-cache` - Limpiar cache

## 🔧 **Configuración del Frontend**

El frontend ya está configurado para manejar ambos sistemas. Para usar el Standalone:

1. **Conectar wallet** en el frontend
2. **Navegar a la sección "Standalone"** en el sidebar
3. **Las operaciones se enviarán automáticamente al puerto 3002**

## 📊 **Diferencias con el Sistema Converter**

| Característica | Converter | Standalone |
|----------------|-----------|------------|
| **Puerto Backend** | 3001 | 3002 |
| **Tipo de Tokens** | Wrapped ERC20 | Nativos PRIV |
| **Modelo** | Deposit/Withdraw | Mint/Burn |
| **Faucet** | ✅ Disponible | ❌ No aplica |
| **Mint** | ❌ No aplica | ✅ Solo owner |
| **Burn** | ❌ No aplica | ✅ Disponible |
| **Balance Público** | ✅ AVAXTEST | ❌ Solo PRIV |

## 🎯 **Flujo de Trabajo Típico**

### **1. Desplegar Contratos Standalone**
```bash
# Desplegar componentes básicos
npm run standalone:init

# Desplegar sistema standalone
npm run standalone:core
```

### **2. Configurar Sistema**
```bash
# Registrar usuarios (editar script para wallet)
npm run standalone:register

# Establecer auditor (editar script para wallet)
npm run standalone:auditor
```

### **3. Usar el Frontend**
1. Iniciar sistema: `npm run standalone`
2. Conectar wallet en el frontend
3. Navegar a sección "Standalone"
4. Realizar operaciones:
   - **Mint** (solo owner): Acuñar nuevos tokens
   - **Transfer**: Transferir tokens privadamente
   - **Burn**: Quemar tokens permanentemente

## 🔐 **Operaciones Disponibles**

### **Mint (Solo Owner)**
- Solo el propietario del contrato puede acuñar tokens
- Genera tokens PRIV nativos encriptados
- Requiere prueba zero-knowledge

### **Transfer Privada**
- Transfiere tokens entre usuarios registrados
- Los montos son privados (no visibles públicamente)
- Mantiene rastro de auditoría para cumplimiento

### **Burn**
- Quema tokens permanentemente
- Reduce el suministro total
- Requiere prueba zero-knowledge

## ⚡ **Optimizaciones Incluidas**

- **Cache de Setup ZK**: Se ejecuta solo una vez
- **Cache de Registro**: Verificaciones rápidas
- **Cache de Balance**: Consultas optimizadas
- **Scripts Dinámicos**: Sin archivos temporales
- **Manejo de Errores**: Mensajes amigables

## 🔧 **Troubleshooting**

### **Problemas Comunes**

1. **"User not registered"**
   - Ejecutar registro: `npm run standalone:register`
   - Verificar que el usuario esté registrado

2. **"Only owner can mint"**
   - Solo el propietario del contrato puede acuñar
   - Verificar que estés usando la wallet correcta

3. **"Insufficient balance"**
   - Verificar balance actual
   - Acuñar más tokens si es necesario

4. **"Auditor not set"**
   - Ejecutar: `npm run standalone:auditor`
   - Verificar que el auditor esté configurado

### **Verificar Estado del Sistema**
```bash
# Verificar backend
curl http://localhost:3002/api/health

# Verificar frontend
curl http://localhost:3000
```

## 🎯 **Próximos Pasos**

1. **Desplegar contratos standalone** en Fuji testnet
2. **Configurar auditor** y registrar usuarios
3. **Probar operaciones** desde el frontend
4. **Verificar funcionalidad** completa del sistema

---

**Nota**: Este sistema es completamente independiente del Converter. Puedes ejecutar ambos sistemas simultáneamente en puertos diferentes.
