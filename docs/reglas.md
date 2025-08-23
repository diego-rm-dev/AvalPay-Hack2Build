# 📋 Reglas del Proyecto AvalPay-Hack2Build

## 🎯 Objetivo
Este documento establece las reglas y estándares que debe cumplir siempre este proyecto para mantener la calidad, consistencia y escalabilidad del código.

## 🏗️ Arquitectura y Estructura

### Frontend (React)
- **Componentes:** Usar hooks funcionales, evitar componentes de clase
- **Estado:** Usar useState y useCallback para optimización
- **Contexto:** Implementar Context API para estado global cuando sea necesario
- **CSS:** Usar variables CSS personalizadas para consistencia de diseño
- **Responsive:** Diseño mobile-first, usar flexbox y grid
- **Accesibilidad:** Incluir atributos ARIA y navegación por teclado

### Backend (Node.js)
- **Módulos:** Usar ES6 modules (import/export)
- **Async/Await:** Preferir sobre callbacks y promesas
- **Error Handling:** Implementar try-catch en todas las operaciones async
- **Validación:** Validar inputs en cada endpoint
- **Logging:** Usar console.log para debug, implementar logging estructurado para producción

### Smart Contracts (Solidity)
- **Versión:** Usar Solidity 0.8.x o superior
- **Seguridad:** Implementar checks-effects-interactions pattern
- **Gas:** Optimizar para eficiencia de gas
- **Documentación:** Comentar funciones públicas y complejas
- **Testing:** 100% cobertura de tests para funciones críticas

## 🎨 Diseño y UX

### Principios de Diseño
- **Minimalismo:** UI limpia y profesional
- **Consistencia:** Usar el mismo sistema de colores y espaciado
- **Dark Mode:** Siempre implementar soporte para modo oscuro
- **Feedback:** Proporcionar feedback visual inmediato para todas las acciones
- **Loading States:** Mostrar estados de carga para operaciones async

### Sistema de Colores
```css
/* Light Mode */
--primary-color: #2563eb;
--text-primary: #1e293b;
--bg-primary: #ffffff;

/* Dark Mode */
--text-primary: #f1f5f9;
--bg-primary: #0f172a;
```

## 🔧 Desarrollo

### Código
- **Formato:** Usar Prettier para formateo automático
- **Linting:** Usar ESLint con reglas estrictas
- **Naming:** camelCase para variables/funciones, PascalCase para componentes
- **Comentarios:** Comentar lógica compleja, no código obvio
- **Imports:** Agrupar imports por tipo (React, librerías, locales)

### Git
- **Commits:** Usar conventional commits (feat:, fix:, docs:, etc.)
- **Branches:** feature/ para nuevas funcionalidades, hotfix/ para correcciones urgentes
- **PRs:** Requerir review antes de merge
- **Messages:** Descriptivos y en español

### Testing
- **Frontend:** Tests unitarios para componentes críticos
- **Backend:** Tests de integración para endpoints
- **Smart Contracts:** Tests completos con Hardhat
- **E2E:** Tests de flujos críticos del usuario

## 🚀 Performance

### Frontend
- **Bundle Size:** Mantener bundle < 500KB
- **Lazy Loading:** Implementar para rutas y componentes pesados
- **Caching:** Usar React.memo y useMemo apropiadamente
- **Images:** Optimizar y usar formatos modernos (WebP)

### Backend
- **Response Time:** < 200ms para operaciones simples
- **Database:** Usar índices apropiados
- **Caching:** Implementar Redis para datos frecuentemente accedidos
- **Compression:** Habilitar gzip/brotli

## 🔒 Seguridad

### General
- **Input Validation:** Validar todos los inputs del usuario
- **XSS:** Sanitizar datos antes de renderizar
- **CSRF:** Implementar tokens CSRF
- **Rate Limiting:** Limitar requests por IP
- **HTTPS:** Usar siempre en producción

### Smart Contracts
- **Reentrancy:** Implementar guardias de reentrancy
- **Overflow:** Usar SafeMath o Solidity 0.8+
- **Access Control:** Implementar roles y permisos
- **Pausable:** Incluir función de pausa para emergencias

## 📦 Dependencias

### Gestión
- **Package Manager:** Usar pnpm para mejor performance
- **Updates:** Mantener dependencias actualizadas
- **Audit:** Ejecutar npm audit regularmente
- **Lock Files:** Commitear lock files

### Librerías Principales
- **Frontend:** React 18+, ethers.js para Web3
- **Backend:** Express.js, cors, helmet
- **Smart Contracts:** OpenZeppelin, Hardhat
- **Testing:** Jest, React Testing Library

## 🐛 Debugging y Logging

### Logging
- **Niveles:** error, warn, info, debug
- **Contexto:** Incluir timestamp, user ID, operation
- **Sensibilidad:** No loggear datos sensibles
- **Rotación:** Implementar rotación de logs

### Error Handling
- **Try-Catch:** Envolver operaciones async
- **User Feedback:** Mostrar mensajes de error amigables
- **Fallbacks:** Implementar estados de fallback
- **Monitoring:** Usar herramientas de monitoreo en producción

## 📚 Documentación

### Código
- **README:** Mantener actualizado con setup y uso
- **API Docs:** Documentar endpoints con ejemplos
- **Comments:** Comentar funciones complejas
- **Changelog:** Mantener registro de cambios

### Usuario
- **Guías:** Crear guías de usuario para funcionalidades complejas
- **Tutoriales:** Videos o screenshots para onboarding
- **FAQ:** Mantener preguntas frecuentes actualizadas

## 🔄 CI/CD

### Pipeline
- **Tests:** Ejecutar tests en cada commit
- **Build:** Verificar que el build funcione
- **Linting:** Verificar formato y reglas
- **Security:** Escanear vulnerabilidades

### Deployment
- **Staging:** Deploy a staging antes de producción
- **Rollback:** Plan de rollback para emergencias
- **Monitoring:** Alertas para errores críticos
- **Backup:** Backup automático de datos

## 📈 Métricas y KPIs

### Performance
- **Load Time:** < 3 segundos para carga inicial
- **TTFB:** < 200ms para respuesta del servidor
- **Error Rate:** < 1% de errores
- **Uptime:** > 99.9% de disponibilidad

### Usuario
- **Engagement:** Tiempo en la aplicación
- **Conversion:** Tasa de conversión de acciones críticas
- **Feedback:** Score de satisfacción del usuario
- **Retention:** Tasa de retención de usuarios

---

**Última actualización:** $(date)
**Versión:** 1.0.0
