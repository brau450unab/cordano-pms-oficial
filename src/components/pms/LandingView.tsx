import React, { useState, useEffect } from 'react';
import { AppScreen } from '../../types';
import { useParking } from '../../context/ParkingContext';

interface LandingViewProps {
  onLoginSuccess: (targetScreen?: AppScreen) => void;
  onNavigate: (screen: AppScreen) => void;
  shiftTimer?: string;
  onInitiateCashClose?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onLoginSuccess,
  onNavigate,
  onShowToast,
}) => {
  const { setIsLoggedIn, isLoggedIn } = useParking();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginState, setLoginState] = useState<'idle' | 'loading'>('idle');
  
  const [searchQuery, setSearchQuery] = useState('');
  
  const [contactForm, setContactForm] = useState({ name: '', company: '', email: '', plan: 'mensual' });
  const [contactSuccess, setContactSuccess] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      onShowToast('Ingrese credenciales', 'error');
      return;
    }
    setLoginState('loading');
    setTimeout(() => {
      setLoginState('idle');
      setIsLoggedIn(true);
      onShowToast('Bienvenido al sistema', 'success');
      // Fix: Force redirect to pos instead of waiting for user to click
      onNavigate('pos');
      onLoginSuccess('pos');
    }, 800);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingContact(true);
    setTimeout(() => {
      setIsSubmittingContact(false);
      setContactSuccess(true);
      onShowToast('Solicitud enviada correctamente', 'success');
      setTimeout(() => setContactSuccess(false), 5000);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF5] text-slate-900 font-sans selection:bg-[#E2498A] selection:text-white pb-24">
      {/* 1. HERO & LOGIN SIDE-BY-SIDE */}
      <section className="relative pt-12 pb-16 lg:pt-24 lg:pb-24 overflow-hidden">
        {/* Background Blobs */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 opacity-40 mix-blend-multiply pointer-events-none">
           <svg viewBox="0 0 400 400" className="w-[600px] h-[600px] text-[#E2498A]/10 animate-[spin_60s_linear_infinite]"><path fill="currentColor" d="M38.1,-48.9C49.9,-40.4,60.5,-28.5,65.4,-14.2C70.3,0.1,69.5,16.8,61.9,29.9C54.3,43,39.9,52.5,24.6,58.4C9.3,64.3,-6.9,66.6,-22.4,63.1C-37.9,59.6,-52.7,50.3,-61.7,37.1C-70.7,23.9,-73.9,6.8,-69.5,-8.3C-65.1,-23.4,-53.1,-36.5,-40,-44.8C-26.9,-53.1,-13.4,-56.6,0.3,-57.1C14.1,-57.5,26.3,-57.4,38.1,-48.9Z" transform="translate(200 200)"/></svg>
        </div>

        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            
            {/* LEFT: BANNER HERO */}
            <div className="lg:col-span-7 space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E2498A]/10 border border-[#E2498A]/20 text-[#E2498A] text-sm font-bold">
                 <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E2498A] opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E2498A]"></span></span>
                 PMS Cloud V1.0
              </div>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tight text-slate-900 leading-[1.05]">
                Gestión inteligente de <span className="text-[#E2498A]">Parkings.</span>
              </h1>
              <p className="text-lg lg:text-xl text-slate-500 font-medium max-w-2xl leading-relaxed">
                Control de acceso, tarifas dinámicas, punto de venta y matriz de ocupación en tiempo real para Serrano 447.
              </p>
            </div>

            {/* RIGHT: LOGIN FORM (ACCESO JUSTO AL LADO) */}
            <div className="lg:col-span-5 relative">
               <div className="bg-white rounded-[2rem] p-8 lg:p-12 shadow-[0_20px_40px_-15px_rgba(0,89,181,0.15)] relative z-10">
                  <div className="text-center mb-8">
                     <h3 className="text-2xl font-black text-slate-900 tracking-tight">Acceso Operador</h3>
                     <p className="text-sm font-medium text-slate-500 mt-2">{isLoggedIn ? 'Tu sesión está activa' : 'Identifícate para iniciar tu turno'}</p>
                  </div>

                  {!isLoggedIn ? (
                     <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                       <div>
                         <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Correo / PIN</label>
                         <input required type="text" placeholder="operador@cordano.cl" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-[#E2498A] focus:bg-white focus:ring-4 focus:ring-[#E2498A]/10 transition-all text-slate-900" />
                       </div>
                       <div>
                         <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Contraseña</label>
                         <input required type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-[#E2498A] focus:bg-white focus:ring-4 focus:ring-[#E2498A]/10 transition-all text-slate-900" />
                       </div>
                       <button type="submit" disabled={loginState === "loading"} className="w-full h-14 bg-[#E2498A] hover:bg-[#C83472] text-white rounded-xl text-sm font-extrabold shadow-lg shadow-[#E2498A]/25 transition-all mt-4 flex items-center justify-center gap-2">
                         {loginState === "loading" ? "Conectando..." : "Ingresar al Sistema"}
                       </button>
                     </form>
                  ) : (
                     <div className="flex flex-col items-center">
                        <button onClick={() => { onNavigate("pos"); onLoginSuccess("pos"); }} className="w-full py-4 bg-[#E2498A] text-white rounded-xl text-sm font-extrabold shadow-lg transition-all hover:bg-[#C83472]">
                          Ir a la Consola POS
                        </button>
                     </div>
                  )}
               </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. SHOWCASE MATRIZ (IMÁGENES VECTORIALES AMPLIADAS) */}
      <section className="py-24 bg-white border-y border-slate-100">
         <div className="max-w-[1200px] mx-auto px-6 text-center">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 mb-4">Monitor en Tiempo Real</h2>
            <p className="text-slate-500 font-medium max-w-2xl mx-auto text-lg mb-16">
               Visualización isométrica de las 30 plazas con semaforización de estados y control de sobreestadía.
            </p>

            <div className="bg-[#0f172a] p-8 lg:p-12 rounded-[3rem] shadow-2xl overflow-hidden relative">
               <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 lg:gap-4 relative z-10">
                  {[...Array(18)].map((_, i) => {
                     const isOccupied = [2,5,8,9,14,16].includes(i);
                     const isPMR = i === 0;
                     return (
                        <div key={i} className={\`aspect-[3/4] rounded-xl border flex flex-col items-center justify-center p-2 \${isOccupied ? 'bg-slate-800 border-slate-700' : isPMR ? 'bg-cyan-900/30 border-cyan-800/50' : 'bg-emerald-900/20 border-emerald-800/30'}\`}>
                           <div className={\`w-full h-full rounded-lg flex items-center justify-center \${isOccupied ? 'bg-slate-700' : 'bg-transparent border border-dashed border-emerald-700/30'}\`}>
                              {isOccupied && (
                                 <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h8a2 2 0 012 2v6m-10 0v-6a2 2 0 012-2z" /></svg>
                              )}
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>
         </div>
      </section>

      {/* 3. CONVENIOS CORPORATIVOS */}
      <section className="py-24 bg-[#FAFAF5]">
         <div className="max-w-[1000px] mx-auto px-6">
            <div className="bg-white rounded-[2.5rem] p-8 lg:p-16 shadow-xl border border-slate-100 flex flex-col lg:flex-row gap-12 items-center">
               <div className="flex-1 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-sm font-bold">Para Empresas</div>
                  <h2 className="text-3xl font-black text-slate-900">Convenios y Flotas</h2>
                  <p className="text-slate-500 font-medium text-lg leading-relaxed">
                     Solicita un convenio para tu empresa. Planes de abonados fijos, techados o flota flotante con facturación consolidada a fin de mes.
                  </p>
               </div>
               
               <div className="flex-1 w-full bg-slate-50 rounded-3xl p-6 lg:p-8 relative">
                  {contactSuccess ? (
                     <div className="absolute inset-0 bg-emerald-500 rounded-3xl flex flex-col items-center justify-center text-white p-8 text-center animate-fade-in-up">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></div>
                        <h4 className="text-xl font-bold">¡Solicitud Enviada!</h4>
                        <p className="mt-2 text-emerald-50">El administrador se contactará a la brevedad.</p>
                     </div>
                  ) : (
                     <form onSubmit={handleContactSubmit} className="space-y-4">
                        <input required type="text" placeholder="Nombre Empresa" value={contactForm.company} onChange={e => setContactForm({...contactForm, company: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-[#E2498A]" />
                        <input required type="email" placeholder="Correo de contacto" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-[#E2498A]" />
                        <select value={contactForm.plan} onChange={e => setContactForm({...contactForm, plan: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-[#E2498A]">
                           <option value="mensual">Abonado Mensual</option>
                           <option value="flota">Flota Corporativa</option>
                           <option value="fijo">Plaza Fija Techada</option>
                        </select>
                        <button type="submit" disabled={isSubmittingContact} className="w-full h-12 bg-[#E2498A] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#C83472] transition-all">
                           {isSubmittingContact ? "Enviando..." : "Solicitar Contacto"}
                        </button>
                     </form>
                  )}
               </div>
            </div>
         </div>
      </section>

      {/* 4. PREGUNTAS FRECUENTES (FAQ) Y BUSCADOR */}
      <section className="py-24 bg-slate-900 text-white">
         <div className="max-w-[800px] mx-auto px-6 text-center space-y-10">
            <div>
               <h2 className="text-3xl font-black mb-4">Centro de Ayuda</h2>
               <p className="text-slate-400 text-lg">Busca documentación operativa o procedimientos de garita.</p>
            </div>
            
            <div className="relative">
               <input 
                  type="text" 
                  placeholder="¿Cómo registrar una fuga de vehículo...?" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full px-6 py-5 bg-white/10 border border-white/20 rounded-2xl text-lg text-white placeholder-slate-400 focus:outline-none focus:bg-white/15 focus:border-[#E2498A] transition-all"
               />
               <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
               </div>
            </div>

            {searchQuery.length > 2 && (
               <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-left animate-fade-in-up flex items-start gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl shrink-0">
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <div>
                     <h4 className="font-bold text-amber-400">Contenido Protegido</h4>
                     <p className="text-sm text-slate-300 mt-1">
                        La base de conocimientos detallada es de acceso exclusivo para operadores. Por favor, 
                        <button onClick={() => window.scrollTo({top:0, behavior:'smooth'})} className="text-white font-bold underline ml-1 hover:text-[#E2498A]">inicia sesión</button> para acceder a los resultados.
                     </p>
                  </div>
               </div>
            )}
         </div>
      </section>

    </div>
  );
};
