# Refactor de src/App.tsx → módulos (V4.0 beta 2.2)

## Qué cambió
El antiguo `App.tsx` (583 líneas, ~72 componentes/tipos/hooks mezclados,
varios de ellos en una sola línea de código) se dividió en 57 archivos:

- `types.ts` — todos los tipos compartidos (Product, Client, ChatMessage, etc.)
- `utils/pageMeta.ts` — pageTitle, pageSubtitle, actionText, actionLabel, examples
- `hooks/useServerStorage.ts` — useServerRows, useServerValue
- `components/shared/` — Info, SearchableProductSelect, SearchableClientSelect, DocumentDetail
- `components/Login.tsx`
- `components/pages/*.tsx` — un archivo por pantalla (ProductsPage, AdvancedPosPage, etc.)
- `components/pages/unused/` — 5 componentes que existían en el código pero **no están
  enganchados a ningún ítem del menú** (LegacyCashPage, LocalDocumentsPage,
  GenericCrudModule, CheckDepositsPage, PaymentOrdersPage). No los borré —según su propio
  AGENTS.md, no hay que eliminar módulos existentes—, pero convendría que confirmen si
  siguen vigentes o si quedaron obsoletos al pasar a las versiones "Beta2".
- `App.tsx` — quedó solo con el componente `App()` y el ruteo entre pantallas.

Ningún componente fue reescrito ni se le cambió lógica: cada bloque de código se extrajo
tal cual (carácter por carácter) del archivo original y solo se le agregaron los `import`
correspondientes. Lo único que se corrigió fue el uso de `React.FormEvent` en 4 archivos:
antes funcionaba "por suerte" (sin import, porque Vite no chequea tipos al buildear);
ahora `React` se importa explícitamente donde se usa.

## Cómo se verificó (sin poder correr `npm install` en este entorno)
1. Se parseó el `App.tsx` original y cada archivo generado con el compilador real de
   TypeScript (`ts.createSourceFile`) → **0 errores de sintaxis** en los 57 archivos.
2. Se armó un programa TypeScript completo (con stubs mínimos de `react` y `lucide-react`,
   ya que no hay red en este entorno para instalar `node_modules`) y se corrió
   `getPreEmitDiagnostics` → **0 errores de "Cannot find name" / "Module has no exported
   member" / módulo no resuelto** en todo el árbol de imports nuevo.
3. Quedan 2 advertencias sin relación con el cambio (preexistentes en el proyecto
   original): `import.meta.env` en `services/api.ts`, y una tipificación floja de
   `SaleTab.mode` en `AdvancedPosPage`. Ninguna de las dos frena el build hoy porque el
   proyecto no tiene `tsconfig.json` ni chequeo de tipos en `vite build` (usa esbuild, que
   solo quita los tipos, no los valida).

## Paleta de colores (styles.css)
Se reemplazaron los ~110 tonos azul/gris corporativos (y sus casi-duplicados: había
más de 20 variantes casi idénticas de gris azulado solo para bordes) por una paleta
pastel coherente: lavanda como color de marca/acento, menta para éxito, durazno para
advertencias, rosa suave para errores, y grises con tinte violeta para texto. La barra
lateral oscura se mantuvo oscura (para no arriesgar el contraste del texto sin poder
renderizar la app y verlo), pero se pasó de azul marino casi negro a un violeta-pizarra
más suave, en línea con el resto de la paleta. Ningún selector ni regla se tocó — es
un reemplazo de colores 1 a 1, verificado por balance de llaves (703 aperturas / 703
cierres, igual que el original). De paso, el archivo (que también estaba comprimido en
pocas líneas) quedó formateado una propiedad por línea.

## Lo que falta que confirmen ustedes
- Correr `npm install && npm run build` en su máquina/CI para la verificación final
  contra las dependencias reales (React, lucide-react) — acá no hay acceso a red para
  hacerlo.
- El **contenido interno** de cada componente (el JSX en sí) sigue como estaba: comprimido
  en una sola línea en los componentes que ya venían así. Separarlos en archivos ya los
  hace mucho más navegables, pero si quieren indentado línea por línea, correr
  `npx prettier --write src` una vez instaladas las dependencias lo resuelve de forma
  segura y mecánica (no hace falta que lo haga a mano).
- Considerar agregar `@types/react` y `@types/react-dom` como devDependencies: hoy el
  proyecto no los tiene, así que el editor no puede ofrecer autocompletado ni chequeo de
  tipos real de React (aunque el build funcione igual).
