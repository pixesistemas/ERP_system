# Cómo seguir trabajando con Git y worktree

## Forma simple recomendada al comenzar

Usá una sola carpeta y una rama por actualización:

```powershell
git checkout main
git pull
git checkout -b feature/pos-cuenta-corriente
```

Después de probar:

```powershell
git add .
git commit -m "feat: mejora POS cuenta corriente e impresión"
git push -u origin feature/pos-cuenta-corriente
```

Cuando el cambio esté aprobado, se integra en `main` desde GitHub.

## Qué es un worktree

Un worktree permite tener dos ramas abiertas al mismo tiempo en carpetas diferentes. Por ejemplo:

```text
erp-produccion/   → rama main
erp-beta21/       → rama feature/pos-cuenta-corriente
```

Se crea desde el repositorio principal:

```powershell
git worktree add ..\erp-beta21 -b feature/pos-cuenta-corriente
```

Trabajás y probás dentro de `erp-beta21` sin modificar la carpeta estable. Al terminar:

```powershell
git worktree remove ..\erp-beta21
```

No necesitás usar worktrees todavía. Para aprender, conviene comenzar con una carpeta y ramas normales. Cuando tengas una versión en producción y otra en desarrollo, el worktree resulta muy útil.

