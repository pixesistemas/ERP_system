import React, { useState } from "react";
import { Bot, ChevronLeft, ChevronRight, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api/v1";

/*
 * Pantalla de recuperación de contraseña, para usuarios comunes y para el
 * superadmin. Si recibe `token`, muestra el formulario para elegir una
 * contraseña nueva; si no, muestra el formulario para pedir el enlace.
 */
export function RecuperarClavePage({ tipo, token }: { tipo: "usuario" | "superadmin"; token?: string }) {
  const esSuper = tipo === "superadmin";
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const base = esSuper ? `${API_URL}/superadmin/auth` : `${API_URL}/auth`;

  async function pedirEnlace(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setOk("");
    try {
      const body = esSuper ? { identificador } : { email: identificador };
      const r = await fetch(`${base}/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo enviar el correo");
      setOk(j.link ? `${j.mensaje} (dev) Enlace: ${j.link}` : j.mensaje || "Revisá tu correo.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function restablecer(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setOk("");
    if (password.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");
    if (password !== password2) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    try {
      const r = await fetch(`${base}/restablecer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo restablecer la contraseña");
      setOk("Contraseña actualizada. Ya podés iniciar sesión.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const volver = () => { window.location.hash = esSuper ? "#/superadmin" : "#/"; };
  const titulo = token
    ? "Nueva contraseña"
    : esSuper
      ? "Recuperar acceso de administración"
      : "Recuperar contraseña";

  return <main className="login-page">
    <section className="login-hero">
      <div className="brand-pill">{esSuper ? <ShieldCheck size={16}/> : <Bot size={16}/>} {esSuper ? "Panel de administración" : "ERP Empresarial"}</div>
      <h1>{titulo}</h1>
      <p>{token ? "Elegí una contraseña nueva para tu cuenta." : "Te enviaremos un enlace por correo para restablecer tu contraseña."}</p>
    </section>
    <form className="login-card" onSubmit={token ? restablecer : pedirEnlace}>
      <div className="logo">{esSuper ? <ShieldCheck size={25}/> : <KeyRound size={25}/>}</div>
      <h2>{titulo}</h2>
      {!token && <label>{esSuper ? "Usuario o email" : "Correo"}<input required value={identificador} onChange={e=>setIdentificador(e.target.value)} autoFocus /></label>}
      {token && <>
        <label>Nueva contraseña<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} autoFocus /></label>
        <label>Repetir contraseña<input required type="password" value={password2} onChange={e=>setPassword2(e.target.value)} /></label>
      </>}
      {error && <div className="error-box">{error}</div>}
      {ok && <div className="success-box">{ok}</div>}
      {!ok && <button disabled={loading}>{loading ? <RefreshCw className="spin"/> : <><span>{token ? "Guardar contraseña" : "Enviar enlace"}</span><ChevronRight size={18}/></>}</button>}
      <a className="login-back" onClick={volver}><ChevronLeft size={15}/> Volver</a>
    </form>
  </main>;
}