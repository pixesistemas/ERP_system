/*
 * Evaluador seguro de expresiones aritméticas simples para los campos de
 * importe (no usa eval/Function). Soporta + - * / (), coma o punto decimal,
 * paréntesis y negativos. Devuelve null si la expresión no es válida.
 */
export function evalMoneyExpression(raw: string): number | null {
  const text = raw.trim().replace(/,/g, '.');
  if (!text) return null;
  // Sin operadores: es solo un número.
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  if (!/^[0-9+\-*/().\s]+$/.test(text)) return null;

  let i = 0;
  function peek() { return text[i]; }
  function error(): never { throw new Error('Expresión inválida'); }

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = text[i++];
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = text[i++];
      const rhs = parseFactor();
      if (op === '/' && rhs === 0) error();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor(): number {
    while (peek() === ' ') i++;
    let sign = 1;
    while (peek() === '+' || peek() === '-') { if (text[i++] === '-') sign *= -1; }
    while (peek() === ' ') i++;
    let value: number;
    if (peek() === '(') {
      i++;
      value = parseExpression();
      while (peek() === ' ') i++;
      if (peek() !== ')') error();
      i++;
    } else {
      const start = i;
      while (i < text.length && /[0-9.]/.test(text[i])) i++;
      if (start === i) error();
      value = Number(text.slice(start, i));
      if (!Number.isFinite(value)) error();
    }
    while (peek() === ' ') i++;
    return value * sign;
  }

  try {
    const result = parseExpression();
    while (peek() === ' ') i++;
    if (i !== text.length) return null;
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
