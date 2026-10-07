import React, { useState, useEffect, useRef } from 'react';
import { AppScreen } from '../../types';
import { useParking } from '../../context/ParkingContext';

interface LandingViewProps {
  onNavigate: (screen: AppScreen) => void;
  shiftTimer: string;
  onInitiateCashClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// ─── Dark/Light theme hook ───────────────────────────────────────────────────
function useDarkMode() {
  const [isDark, setIsDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return { isDark, setIsDark };
}

// ─── Intersection Observer hook for scroll animations ────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─── Animation wrapper ───────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(24px)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Modules data ────────────────────────────────────────────────────────────
const MODULES = [
  {
    icon: '🚗',
    badge: 'Garita',
    title: 'Ingreso y Salida Rápida',
    desc: 'Registra vehículos en menos de 5 segundos. Ticket impreso con QR + código de barras. Atajos de teclado F1–F9 para no perder velocidad en pista.',
    color: '#10B981',
  },
  {
    icon: '🗺️',
    badge: 'Tiempo Real',
    title: 'Mapa de Ocupación en Vivo',
    desc: 'Visualiza las 30 plazas en un mapa interactivo actualizado cada segundo. Verde = libre, Gris = ocupado, Ámbar = reservado.',
    color: '#3B82F6',
  },
  {
    icon: '💼',
    badge: 'Convenios',
    title: 'Abonados y Convenios Comerciales',
    desc: 'Gestiona contratos mensuales con empresas, bancos y clientes frecuentes. Alertas automáticas de vencimiento para renovar en pista.',
    color: '#F59E0B',
  },
  {
    icon: '💳',
    badge: 'POS & Cobro',
    title: 'Cobro Claro y Transparente',
    desc: 'Cobra en efectivo, tarjeta o transferencia. El sistema calcula el vuelto exacto y el desglose por denominación de billetes y monedas.',
    color: '#8B5CF6',
  },
  {
    icon: '📊',
    badge: 'Finanzas',
    title: 'Cierre de Caja Antifraude',
    desc: 'Arqueo ciego obligatorio al cerrar turno. El cajero declara el dinero físico sin ver el monto del sistema. Sello criptográfico SHA-256.',
    color: '#EF4444',
  },
  {
    icon: '📱',
    badge: 'Notificaciones',
    title: 'Comprobantes por WhatsApp',
    desc: 'Envío automático de ticket al número del cliente al momento de ingresar. Sin papel, sin esperas, con registro digital.',
    color: '#06B6D4',
  },
  {
    icon: '🔒',
    badge: 'Sin Internet',
    title: 'Modo Offline Garantizado',
    desc: 'Opera sin conexión a internet. Los tickets emitidos en contingencia se sincronizan automáticamente cuando vuelve la señal.',
    color: '#10B981',
  },
  {
    icon: '📈',
    badge: 'Reportes',
    title: 'Reportes Financieros',
    desc: 'Resumen diario, semanal y mensual de recaudación, ocupación y anomalías. Exportable a PDF y planilla para el contador.',
    color: '#F59E0B',
  },
];

// ─── FAQ data ────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: '¿Cuánto demora en registrar un vehículo?',
    a: 'En condiciones normales, el ingreso se completa en menos de 5 segundos, incluyendo la impresión del ticket. El cobro a la salida tarda menos de 10 segundos.',
  },
  {
    q: '¿Funciona si se va el internet?',
    a: 'Sí. El sistema opera en modo Offline completamente funcional con almacenamiento local. Los tickets offline llevan el sufijo "O" y se sincronizan solos cuando vuelve la conexión.',
  },
  {
    q: '¿Cómo se maneja el cierre de turno?',
    a: 'El operador cuenta físicamente el dinero en gaveta y lo declara denominación por denominación (billetes + monedas). Solo después el sistema muestra la diferencia con el monto esperado. Esto elimina el fraude.',
  },
  {
    q: '¿Se pueden dar descuentos?',
    a: 'Sí, pero cada descuento requiere el PIN personal del operador y una justificación escrita de más de 10 caracteres. Todo queda en la bitácora de auditoría.',
  },
  {
    q: '¿Cómo se gestionan los abonados mensuales?',
    a: 'Los abonados tienen plaza bloqueada en la matriz. Al ingresar, el sistema los identifica y al salir el cobro es cero (o tarifa pactada). Recibes alerta automática 5 días antes del vencimiento.',
  },
  {
    q: '¿Qué pasa si un cliente pierde el ticket?',
    a: 'El operador activa la opción "Ticket Extraviado" que requiere PIN de Administrador. Se cobra el recargo fijo de \$8.000 CLP y queda registrado en auditoría.',
  },
];

// ─── Stats data ──────────────────────────────────────────────────────────────
const STATS = [
  { value: '< 5 seg', label: 'Ingreso de vehículo' },
  { value: '30', label: 'Plazas en tiempo real' },
  { value: '100%', label: 'Operación offline' },
  { value: '24/7', label: 'Disponibilidad' },
];

// ─── Slot mini-preview ───────────────────────────────────────────────────────
const DEMO_SLOTS = [
  { id: 'A-01', status: 'libre' }, { id: 'A-02', status: 'ocupado' }, { id: 'A-03', status: 'ocupado' },
  { id: 'A-04', status: 'libre' }, { id: 'A-05', status: 'reservado' }, { id: 'A-06', status: 'ocupado' },
  { id: 'A-07', status: 'ocupado' }, { id: 'A-08', status: 'libre' }, { id: 'A-09', status: 'abonado' },
  { id: 'A-10', status: 'libre' }, { id: 'B-16', status: 'ocupado' }, { id: 'B-17', status: 'libre' },
  { id: 'B-18', status: 'ocupado' }, { id: 'B-19', status: 'libre' }, { id: 'B-20', status: 'libre' },
];

const SLOT_COLORS: Record<string, string> = {
  libre: '#10B981',
  ocupado: '#64748B',
  reservado: '#F59E0B',
  abonado: '#3B82F6',
};

// ─── Main component ───────────────────────────────────────────────────────────
export const LandingView: React.FC<LandingViewProps> = ({ onNavigate, onShowToast }) => {
  const { setUserRole, setIsLoggedIn } = useParking();
  const { isDark, setIsDark } = useDarkMode();

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginRole, setLoginRole] = useState<'operador' | 'administrador'>('operador');

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Animated counter for slots
  const [occupancy, setOccupancy] = useState(18);
  useEffect(() => {
    const interval = setInterval(() => {
      setOccupancy((o) => {
        const next = o + (Math.random() > 0.5 ? 1 : -1);
        return Math.min(28, Math.max(10, next));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Animated dot ticker
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  // Demo login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginEmail.trim()) { setLoginError('Ingresa tu correo o usuario.'); return; }
    if (!loginPassword.trim()) { setLoginError('Ingresa tu contraseña.'); return; }
    setLoginLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    setUserRole(loginRole);
    setIsLoggedIn(true);
    onShowToast(`Bienvenido/a — Turno iniciado como ${loginRole === 'administrador' ? 'Administrador' : 'Operador'}.`, 'success');
    onNavigate('menu');
    setLoginLoading(false);
  };

  // ─── THEME ──────────────────────────────────────────────────────────────────
  const bg = isDark ? '#09090f' : '#f8fafc';
  const surface = isDark ? '#111118' : '#ffffff';
  const surfaceRaised = isDark ? '#17171f' : '#f1f5f9';
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#475569';
  const textTertiary = isDark ? '#475569' : '#94a3b8';
  const accent = '#10B981';
  const accentHover = '#059669';
  const btnPrimary = isDark ? '#10B981' : '#0f172a';
  const btnPrimaryText = '#ffffff';
  const navBg = isDark ? 'rgba(9,9,15,0.92)' : 'rgba(255,255,255,0.92)';

  return (
    <div style={{ background: bg, color: textPrimary, minHeight: '100vh', fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif' }}>

      {/* ══ TOP NAV (Public Landing) ══════════════════════════════════════════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: navBg,
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#10B981', fontWeight: 900, fontSize: 13, fontFamily: 'JetBrains Mono, monospace', letterSpacing: -1 }}>CP</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: -0.3, color: textPrimary }}>ParkOps</div>
              <div style={{ fontSize: 10, color: textSecondary, fontWeight: 600, letterSpacing: 0.3 }}>Serrano 447 · Iquique</div>
            </div>
          </div>

          {/* Nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="hidden sm:flex">
            {['Módulos', 'Funciones', 'FAQ'].map((item) => (
              <button
                key={item}
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: textSecondary, background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.2s, background 0.2s' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = textPrimary; (e.target as HTMLElement).style.background = surfaceRaised; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = textSecondary; (e.target as HTMLElement).style.background = 'transparent'; }}
                onClick={() => {
                  const el = document.getElementById(`section-${item.toLowerCase()}`);
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Dark/Light toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: surfaceRaised, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              <span style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</span>
            </button>
            {/* CTA */}
            <button
              onClick={() => onNavigate('login')}
              style={{ padding: '7px 16px', borderRadius: 8, background: btnPrimary, color: btnPrimaryText, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', letterSpacing: -0.2 }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '0.87'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
            >
              Iniciar sesión →
            </button>
          </div>
        </div>
      </nav>

      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 20px 56px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: 40, alignItems: 'center' }} className="hero-grid">
          {/* Left */}
          <div>
            <Reveal>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5', border: `1px solid ${isDark ? 'rgba(16,185,129,0.25)' : '#bbf7d0'}`, borderRadius: 99, padding: '5px 12px', marginBottom: 24 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: 0.8, textTransform: 'uppercase' }}>Sistema Activo · {occupancy}/30 plazas</span>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.08, color: textPrimary, margin: '0 0 20px' }}>
                Controla tu<br />
                estacionamiento<br />
                <span style={{ color: '#10B981' }}>sin complicaciones.</span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: textSecondary, maxWidth: 480, marginBottom: 32 }}>
                Plataforma de gestión diseñada para el operador de garita. Ingresa vehículos, cobra, gestiona abonados y cierra el turno con un par de clics. Sin papeles, sin errores, sin excusas.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => onNavigate('login')}
                  style={{ padding: '12px 28px', borderRadius: 10, background: btnPrimary, color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8, boxShadow: `0 4px 14px rgba(0,0,0,0.15)` }}
                >
                  Acceder al sistema
                  <span style={{ fontSize: 18 }}>→</span>
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('section-módulos');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  style={{ padding: '12px 24px', borderRadius: 10, background: surfaceRaised, color: textPrimary, border: `1px solid ${border}`, fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Ver módulos
                </button>
              </div>
            </Reveal>

            {/* Stats strip */}
            <Reveal delay={260}>
              <div style={{ display: 'flex', gap: 28, marginTop: 44, paddingTop: 32, borderTop: `1px solid ${border}`, flexWrap: 'wrap' }}>
                {STATS.map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: textPrimary, fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: textTertiary, fontWeight: 600, marginTop: 2, letterSpacing: 0.3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right: Login Panel */}
          <Reveal delay={120} className="login-card-container">
            <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 20, padding: 32, boxShadow: isDark ? '0 24px 48px rgba(0,0,0,0.4)' : '0 16px 48px rgba(15,23,42,0.08)' }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Acceso al Sistema</div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: textPrimary, margin: 0 }}>Ingresa a tu cuenta</h2>
              </div>

              {/* Role toggle */}
              <div style={{ display: 'flex', background: surfaceRaised, borderRadius: 10, padding: 3, marginBottom: 20 }}>
                {(['operador', 'administrador'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setLoginRole(role)}
                    style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, letterSpacing: 0.2, transition: 'all 0.2s',
                      background: loginRole === role ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                      color: loginRole === role ? textPrimary : textTertiary,
                      boxShadow: loginRole === role ? (isDark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(15,23,42,0.08)') : 'none',
                    }}
                  >
                    {role === 'operador' ? '🎫 Operador' : '⚙️ Administrador'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleLogin}>
                {/* Email/user */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: textSecondary, marginBottom: 6, letterSpacing: 0.2 }}>CORREO ELECTRÓNICO</label>
                  <input
                    type="text"
                    autoFocus
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="operador@cordano.cl"
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${loginError && !loginEmail ? '#EF4444' : border}`,
                      background: isDark ? '#0d0d14' : '#f8fafc', color: textPrimary, fontSize: 14, fontWeight: 600,
                      outline: 'none', transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                    onBlur={(e) => (e.target.style.borderColor = border)}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: textSecondary, letterSpacing: 0.2 }}>CONTRASEÑA</label>
                    <button type="button" style={{ fontSize: 11, color: '#10B981', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>¿Olvidaste tu contraseña?</button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••"
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '10px 40px 10px 12px', borderRadius: 9, border: `1.5px solid ${loginError && !loginPassword ? '#EF4444' : border}`,
                        background: isDark ? '#0d0d14' : '#f8fafc', color: textPrimary, fontSize: 14, fontWeight: 600,
                        outline: 'none', transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = '#10B981')}
                      onBlur={(e) => (e.target.style.borderColor = border)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: textTertiary }}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {loginError && (
                  <div style={{ background: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#EF4444', fontWeight: 600 }}>
                    ⚠️ {loginError}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loginLoading}
                  style={{
                    width: '100%', padding: '11px 0', borderRadius: 10, background: loginLoading ? accentHover : accent, color: '#fff', border: 'none',
                    fontWeight: 800, fontSize: 14, cursor: loginLoading ? 'wait' : 'pointer', transition: 'all 0.2s', letterSpacing: -0.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: `0 4px 12px rgba(16,185,129,0.3)`,
                  }}
                >
                  {loginLoading ? (
                    <><span style={{ fontSize: 16, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Verificando...</>
                  ) : (
                    <>Ingresar al Sistema →</>
                  )}
                </button>
              </form>

              {/* Divider + contact */}
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 11, color: textTertiary }}>¿Problemas para ingresar?</div>
                <button
                  style={{ fontSize: 12, fontWeight: 700, color: '#10B981', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => onShowToast('Contacta a tu administrador de sistema.', 'info')}
                >
                  Contactar soporte →
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ MATRIX PREVIEW ═══════════════════════════════════════════════════ */}
      <section style={{ background: isDark ? '#0a0a14' : '#0f172a', padding: '64px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Vista en tiempo real</div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 900, color: '#f8fafc', letterSpacing: -1, margin: 0, lineHeight: 1.15 }}>
                Tu estacionamiento,<br />visualizado al instante
              </h2>
              <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 12, maxWidth: 440, margin: '12px auto 0' }}>
                Monitorea las {occupancy} plazas ocupadas y las {30 - occupancy} disponibles en tiempo real, desde cualquier dispositivo.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>Matriz de 30 Plazas — Serrano 447</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>Actualización: cada 500 ms</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', fontFamily: 'JetBrains Mono, monospace', background: 'rgba(16,185,129,0.12)', borderRadius: 6, padding: '4px 10px' }}>
                    {30 - occupancy} Libres
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', fontFamily: 'JetBrains Mono, monospace', background: 'rgba(100,116,139,0.12)', borderRadius: 6, padding: '4px 10px' }}>
                    {occupancy} Ocupadas
                  </div>
                </div>
              </div>

              {/* Slot grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
                {DEMO_SLOTS.map((slot, i) => (
                  <div
                    key={slot.id}
                    style={{
                      background: `${SLOT_COLORS[slot.status]}18`,
                      border: `1.5px solid ${SLOT_COLORS[slot.status]}40`,
                      borderRadius: 10,
                      padding: '10px 8px',
                      textAlign: 'center',
                      transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
                      animationDelay: `${i * 40}ms`,
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, color: SLOT_COLORS[slot.status], letterSpacing: 0.5, fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 }}>
                      {slot.id}
                    </div>
                    <div style={{ fontSize: 16 }}>
                      {slot.status === 'libre' ? '🟢' : slot.status === 'ocupado' ? '🚗' : slot.status === 'reservado' ? '🟡' : '🔵'}
                    </div>
                    <div style={{ fontSize: 8, color: SLOT_COLORS[slot.status], fontWeight: 700, textTransform: 'uppercase', marginTop: 4 }}>
                      {slot.status}
                    </div>
                  </div>
                ))}
                {/* Remaining placeholder slots */}
                {Array.from({ length: 30 - DEMO_SLOTS.length }, (_, i) => (
                  <div key={`extra-${i}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px dashed rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#334155', letterSpacing: 0.5, fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 }}>
                      {i + DEMO_SLOTS.length < 15 ? `A-${String(i + DEMO_SLOTS.length + 1).padStart(2, '0')}` : `B-${String(i + DEMO_SLOTS.length - 14).padStart(2, '0')}`}
                    </div>
                    <div style={{ fontSize: 8, color: '#334155' }}>···</div>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
                {Object.entries({ libre: 'Libre', ocupado: 'Ocupado', reservado: 'Reservado', abonado: 'Abonado' }).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B', fontWeight: 600 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: SLOT_COLORS[k] }} />
                    {v}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ MODULES ══════════════════════════════════════════════════════════ */}
      <section id="section-módulos" style={{ padding: '80px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Módulos del sistema</div>
                <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 900, color: textPrimary, letterSpacing: -0.8, margin: 0, lineHeight: 1.2 }}>
                  Todo lo que tu<br />estacionamiento necesita
                </h2>
              </div>
              <p style={{ fontSize: 14, color: textSecondary, maxWidth: 320, lineHeight: 1.7, margin: 0 }}>
                Suite completa para el control de todos los ingresos, turnos, abonados y reportes desde tu garita.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {MODULES.map((mod, i) => (
              <Reveal key={mod.title} delay={i * 50}>
                <ModuleCard mod={mod} isDark={isDark} surface={surface} border={border} textPrimary={textPrimary} textSecondary={textSecondary} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ══════════════════════════════════════════════════════════════ */}
      <section id="section-faq" style={{ background: isDark ? '#0a0a14' : '#f1f5f9', padding: '80px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Preguntas frecuentes</div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 900, color: textPrimary, letterSpacing: -0.8, margin: 0 }}>
                Respuestas claras, sin tecnicismos
              </h2>
              <p style={{ fontSize: 14, color: textSecondary, marginTop: 12 }}>
                Las preguntas que más nos hacen los operadores antes de empezar.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 40}>
                <div
                  style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', transition: 'box-shadow 0.2s', boxShadow: openFaq === i ? (isDark ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(15,23,42,0.06)') : 'none' }}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{ width: '100%', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 16 }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 700, color: textPrimary, lineHeight: 1.4 }}>
                      <span style={{ color: accent, marginRight: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                        P.{String(i + 1).padStart(2, '0')}
                      </span>
                      {faq.q}
                    </span>
                    <span style={{ fontSize: 20, color: textTertiary, transition: 'transform 0.3s', transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0)', flexShrink: 0 }}>+</span>
                  </button>
                  {openFaq === i && (
                    <div style={{ padding: '0 24px 20px', fontSize: 14, color: textSecondary, lineHeight: 1.8, borderTop: `1px solid ${border}`, paddingTop: 16 }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>

          {/* Support cards */}
          <Reveal delay={200}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 40 }}>
              {[
                { icon: '📞', title: 'Soporte en Garita', desc: 'Asistencia directa para operadores en turno.', cta: '+56 57 281 6090' },
                { icon: '📖', title: 'Manual de Procedimientos', desc: 'Guías paso a paso para cada operación.', cta: 'Ver manual →' },
                { icon: '💬', title: 'Pide de Ayuda', desc: 'Por correo o WhatsApp en horario comercial.', cta: 'Contactar →' },
              ].map((card) => (
                <div
                  key={card.title}
                  style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: 20 }}
                >
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{card.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: textPrimary, marginBottom: 6 }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: textSecondary, marginBottom: 12, lineHeight: 1.6 }}>{card.desc}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>{card.cta}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ FINAL CTA ════════════════════════════════════════════════════════ */}
      <section style={{ background: '#0f172a', padding: '80px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <Reveal>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 }}>Empieza hoy</div>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 900, color: '#f8fafc', letterSpacing: -1, margin: '0 0 16px', lineHeight: 1.15 }}>
              Tu garita merece<br />una herramienta que funcione.
            </h2>
            <p style={{ fontSize: 15, color: '#94a3b8', marginBottom: 36, lineHeight: 1.7 }}>
              Ingresa con tus credenciales y empieza a operar en minutos. Sin instalaciones complicadas, sin contratos difíciles.
            </p>
            <button
              onClick={() => onNavigate('login')}
              style={{ padding: '14px 36px', borderRadius: 12, background: '#10B981', color: '#fff', border: 'none', fontWeight: 800, fontSize: 16, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 8px 24px rgba(16,185,129,0.3)', letterSpacing: -0.3 }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'scale(1.03)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
            >
              Acceder al Sistema →
            </button>
          </Reveal>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer style={{ background: isDark ? '#060608' : '#0f172a', padding: '32px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#f8fafc' }}>Cordano Inversiones Inmobiliarias Ltda.</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>Serrano 447 · Iquique, Región de Tarapacá · Chile</div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {['Términos de Servicio', 'Políticas de Privacidad', 'Contacto'].map((item) => (
              <button key={item} style={{ fontSize: 11, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{item}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#334155' }}>© 2026 ParkOps · Todos los derechos reservados</div>
        </div>
      </footer>

      {/* ══ GLOBAL ANIMATION STYLES ══════════════════════════════════════════ */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
          .login-card-container {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
};

// ─── Module Card sub-component ────────────────────────────────────────────────
function ModuleCard({ mod, isDark, surface, border, textPrimary, textSecondary }: {
  mod: typeof MODULES[0];
  isDark: boolean;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: surface,
        border: `1.5px solid ${hovered ? mod.color + '40' : border}`,
        borderRadius: 16,
        padding: '22px',
        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered ? (isDark ? `0 16px 32px rgba(0,0,0,0.3), 0 0 0 1px ${mod.color}20` : `0 12px 32px rgba(15,23,42,0.08)`) : 'none',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ fontSize: 28 }}>{mod.icon}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: mod.color, background: `${mod.color}16`, borderRadius: 6, padding: '3px 8px', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {mod.badge}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: textPrimary, marginBottom: 8, lineHeight: 1.3 }}>{mod.title}</div>
      <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.7 }}>{mod.desc}</div>
    </div>
  );
}
