import { useEffect, useRef, useState } from "react";
import { evalMoneyExpression } from "../../utils/calc";

/*
 * Input de importe "tipo calculadora": mientras se escribe, acepta números y
 * operadores (+ - * / paréntesis) y al salir del campo (blur) o presionar
 * Enter, reemplaza el texto por el resultado calculado. Siempre muestra el
 * signo de la moneda a la izquierda. Reemplaza a los <input type="number">
 * sueltos que había en cada pantalla.
 *
 * Mientras el campo tiene el foco se ve en dígitos simples (más fácil de
 * editar); al salir se muestra con formato argentino (punto de miles, coma
 * decimal) para que se lea de un vistazo.
 *
 * Sigue soportando el atajo existente: presionar "*" en cualquier campo de
 * pago dispara onCompleteMissing (completar el importe faltante), igual que
 * antes — pero solo cuando el campo está vacío o en 0, para no chocar con el
 * "*" como operador de multiplicación.
 */
function formatDisplay(value: number): string {
  if (!value) return "";
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MoneyInput({
  value,
  onChange,
  onCompleteMissing,
  onEnter,
  currency = "$",
  min,
  className,
  placeholder,
  inputRef,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  onCompleteMissing?: () => void;
  onEnter?: () => void;
  currency?: string;
  min?: number;
  className?: string;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
}) {
  const [text, setText] = useState(formatDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatDisplay(value));
  }, [value]);

  function commit() {
    const result = evalMoneyExpression(text);
    if (result === null) {
      setInvalid(true);
      return;
    }
    const bounded = min != null ? Math.max(min, result) : result;
    setInvalid(false);
    setText(formatDisplay(bounded));
    onChange(bounded);
  }

  return (
    <label className={`money-input${invalid ? " money-input-invalid" : ""}${className ? ` ${className}` : ""}`}>
      <span className="money-input-currency">{currency}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          setText(value ? String(value) : "");
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setInvalid(false);
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "*" && onCompleteMissing && (!text || Number(text) === 0)) {
            e.preventDefault();
            focused.current = false;
            onCompleteMissing();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            onEnter?.();
          }
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
      />
    </label>
  );
}
