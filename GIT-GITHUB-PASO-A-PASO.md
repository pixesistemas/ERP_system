# Primeros pasos con Git y GitHub

## 1. Configurar identidad una sola vez

```powershell
git config --global user.name "Jorge Almada"
git config --global user.email "TU_EMAIL_DE_GITHUB"
```

## 2. Crear el repositorio local

Ejecute dentro de la carpeta principal:

```powershell
git init
git add .
git commit -m "feat: primera demo conversacional AFIP"
```

## 3. Crear el repositorio en GitHub

En GitHub seleccione **New repository** y use un nombre como:

`afip-conversacional-demo`

No agregue README ni `.gitignore` desde GitHub porque ya están incluidos.

## 4. Vincular y subir

GitHub mostrará la URL del repositorio. Reemplace `TU_USUARIO`:

```powershell
git branch -M main
git remote add origin https://github.com/TU_USUARIO/afip-conversacional-demo.git
git push -u origin main
```

## 5. Trabajo cotidiano

```powershell
git status
git add .
git commit -m "feat: descripción del cambio"
git push
```

## 6. Crear una versión nueva sin romper main

```powershell
git checkout -b feature/historial-conversaciones
```

Al terminar:

```powershell
git add .
git commit -m "feat: agrega historial de conversaciones"
git push -u origin feature/historial-conversaciones
```

Luego se crea un Pull Request desde GitHub para unirla a `main`.

## Convención simple de commits

- `feat:` nueva función.
- `fix:` corrección.
- `docs:` documentación.
- `refactor:` mejora interna sin cambiar la función.
- `chore:` configuración o mantenimiento.

Nunca suba `.env`, certificados `.crt`, claves `.key`, tokens ni bases con datos reales.
