function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCUIT(cuit) {
  const value = onlyNumbers(cuit);

  if (value.length !== 11) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = value.split("").map(Number);

  const sum = multipliers.reduce((acc, multiplier, index) => {
    return acc + digits[index] * multiplier;
  }, 0);

  const mod = sum % 11;
  const expected = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;

  return expected === digits[10];
}

function isValidDNI(dni) {
  const value = onlyNumbers(dni);
  return value.length >= 7 && value.length <= 8;
}

function normalizePhone(phone) {
  return onlyNumbers(phone);
}

module.exports = {
  onlyNumbers,
  isValidCUIT,
  isValidDNI,
  normalizePhone,
};
