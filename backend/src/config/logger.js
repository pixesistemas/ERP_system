class Logger {
  info(msg) {
    console.log(`[INFO] ${msg}`);
  }

  error(msg) {
    console.error(`[ERROR] ${msg}`);
  }
}

module.exports = new Logger();
