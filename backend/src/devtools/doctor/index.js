const fs = require("fs");
const path = require("path");

/*
 * Project Doctor
 *
 * Revisa la estructura básica del proyecto y detecta
 * problemas comunes antes de ejecutar una demo o despliegue.
 */
class ProjectDoctor {
  constructor() {
    this.projectRoot = process.cwd();
    this.srcPath = path.join(this.projectRoot, "src");
    this.databasePath = path.join(this.projectRoot, "database");
    this.testsPath = path.join(this.projectRoot, "tests");

    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  /*
   * Ejecuta todas las verificaciones disponibles.
   */
  run() {
    console.log("");
    console.log("====================================");
    console.log(" PIXE ERP AI - PROJECT DOCTOR");
    console.log("====================================");
    console.log("");

    const jsFiles = this.getFilesRecursive(this.srcPath, ".js");

    this.checkProjectFolders();
    this.checkLocalImports(jsFiles);
    this.checkAppRoutes();
    this.checkMigrations();
    this.checkTests();
    this.findPossibleUnusedFiles(jsFiles);

    this.printSummary(jsFiles);
  }

  /*
   * Verifica que existan las carpetas principales.
   */
  checkProjectFolders() {
    const requiredFolders = [
      "src",
      "src/controllers",
      "src/routes",
      "src/repositories",
      "src/domain",
      "src/core",
      "database/migrations",
      "database/seeders",
      "tests",
      "docs",
    ];

    for (const folder of requiredFolders) {
      const fullPath = path.join(this.projectRoot, folder);

      if (!fs.existsSync(fullPath)) {
        this.warnings.push(`Carpeta faltante: ${folder}`);
      }
    }
  }

  /*
   * Busca imports locales con rutas que no existen.
   */
  checkLocalImports(files) {
    const requireRegex = /require\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");

      let match;

      while ((match = requireRegex.exec(content)) !== null) {
        const importPath = match[1];

        const resolvedBase = path.resolve(path.dirname(file), importPath);

        const candidates = [
          resolvedBase,
          `${resolvedBase}.js`,
          path.join(resolvedBase, "index.js"),
        ];

        const exists = candidates.some((candidate) => fs.existsSync(candidate));

        if (!exists) {
          this.errors.push(
            `Import roto en ${this.relative(file)}: ${importPath}`,
          );
        }
      }
    }
  }

  /*
   * Revisa que app.js exista y muestra cuántas rutas registra.
   */
  checkAppRoutes() {
    const appPath = path.join(this.srcPath, "app.js");

    if (!fs.existsSync(appPath)) {
      this.errors.push("No existe src/app.js");
      return;
    }

    const content = fs.readFileSync(appPath, "utf8");

    const routeCount = (content.match(/app\.use\s*\(/g) || []).length;

    this.info.push(`Rutas/middlewares registrados en app.js: ${routeCount}`);

    const duplicatedImports = this.findDuplicateRequires(content);

    for (const duplicated of duplicatedImports) {
      this.warnings.push(`Import repetido en app.js: ${duplicated}`);
    }
  }

  /*
   * Revisa migraciones y detecta números repetidos.
   */
  checkMigrations() {
    const migrationsPath = path.join(this.databasePath, "migrations");

    if (!fs.existsSync(migrationsPath)) {
      this.errors.push("No existe database/migrations");
      return;
    }

    const migrations = fs
      .readdirSync(migrationsPath)
      .filter((file) => file.endsWith(".js"))
      .sort();

    const numbers = new Map();

    for (const migration of migrations) {
      const match = migration.match(/^(\d+)[-_]/);

      if (!match) {
        this.warnings.push(`Migración sin numeración: ${migration}`);
        continue;
      }

      const number = match[1];

      if (!numbers.has(number)) {
        numbers.set(number, []);
      }

      numbers.get(number).push(migration);
    }

    for (const [number, files] of numbers) {
      if (files.length > 1) {
        this.errors.push(
          `Número de migración duplicado ${number}: ${files.join(", ")}`,
        );
      }
    }

    this.info.push(`Migraciones encontradas: ${migrations.length}`);
  }

  /*
   * Cuenta los tests existentes.
   */
  checkTests() {
    if (!fs.existsSync(this.testsPath)) {
      this.warnings.push("No existe la carpeta tests");
      return;
    }

    const tests = this.getFilesRecursive(this.testsPath, ".js");

    this.info.push(`Tests encontrados: ${tests.length}`);

    if (tests.length === 0) {
      this.warnings.push("No hay tests JavaScript");
    }
  }

  /*
   * Señala archivos que no parecen ser importados.
   *
   * Es solo una advertencia: no deben borrarse
   * automáticamente porque algunos pueden ser ejecutables.
   */
  findPossibleUnusedFiles(files) {
    const allContents = files
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    const ignoredNames = new Set([
      "app.js",
      "server.js",
      "index.js",
      "database.js",
      "init.js",
    ]);

    for (const file of files) {
      const fileName = path.basename(file);

      if (ignoredNames.has(fileName)) {
        continue;
      }

      if (file.includes(`${path.sep}devtools${path.sep}`)) {
        continue;
      }

      const withoutExtension = fileName.replace(/\.js$/, "");

      const possibleReferences = [
        `/${withoutExtension}"`,
        `/${withoutExtension}'`,
        `/${fileName}"`,
        `/${fileName}'`,
      ];

      const referenced = possibleReferences.some((value) =>
        allContents.includes(value),
      );

      if (!referenced) {
        this.warnings.push(`Posible archivo sin uso: ${this.relative(file)}`);
      }
    }
  }

  /*
   * Encuentra requires repetidos dentro de un archivo.
   */
  findDuplicateRequires(content) {
    const regex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

    const counts = new Map();
    let match;

    while ((match = regex.exec(content)) !== null) {
      const value = match[1];

      counts.set(value, (counts.get(value) || 0) + 1);
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value);
  }

  /*
   * Obtiene archivos de forma recursiva.
   */
  getFilesRecursive(directory, extension) {
    if (!fs.existsSync(directory)) {
      return [];
    }

    const results = [];

    for (const entry of fs.readdirSync(directory)) {
      const fullPath = path.join(directory, entry);

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results.push(...this.getFilesRecursive(fullPath, extension));
      } else if (fullPath.endsWith(extension)) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /*
   * Devuelve una ruta relativa al proyecto.
   */
  relative(filePath) {
    return path.relative(this.projectRoot, filePath);
  }

  /*
   * Muestra el resultado final del diagnóstico.
   */
  printSummary(jsFiles) {
    for (const item of this.info) {
      console.log(`ℹ ${item}`);
    }

    console.log("");

    for (const warning of this.warnings) {
      console.log(`⚠ ${warning}`);
    }

    if (this.warnings.length > 0) {
      console.log("");
    }

    for (const error of this.errors) {
      console.log(`✖ ${error}`);
    }

    console.log("");
    console.log("------------------------------------");
    console.log(`Archivos JS analizados: ${jsFiles.length}`);
    console.log(`Advertencias: ${this.warnings.length}`);
    console.log(`Errores: ${this.errors.length}`);

    const score = Math.max(
      0,
      100 - this.errors.length * 10 - this.warnings.length * 2,
    );

    console.log(`Salud estimada: ${score}%`);
    console.log("------------------------------------");
    console.log("");

    if (this.errors.length > 0) {
      process.exitCode = 1;
    }
  }
}

/*
 * Ejecuta el diagnóstico cuando se llama
 * mediante npm run doctor.
 */
new ProjectDoctor().run();
