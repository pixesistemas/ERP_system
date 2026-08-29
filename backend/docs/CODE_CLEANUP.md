# Limpieza de código

## Eliminados

- `src/services/stockAutomatico.service.js`
  Reemplazado por `src/stock/stockEngine.js`.

- `src/services/stockValidation.service.js`
  Reemplazado por `src/stock/stockEngine.js`.

- `src/middleware/user.middleware.js`
  Reemplazado por autenticación JWT.

## En revisión

- Controladores directos frente a Process Engine.
- Servicios antiguos de PDF.
- Repositorios con métodos duplicados.
- Listeners registrados de forma automática.
- Scripts de prueba temporales.
- Seeders reemplazados por versiones más completas.

## Regla

Un archivo solo puede eliminarse cuando:

1. No tiene imports activos.
2. Su funcionalidad está cubierta por otro módulo.
3. El flujo correspondiente fue probado.
4. El servidor inicia sin errores.
