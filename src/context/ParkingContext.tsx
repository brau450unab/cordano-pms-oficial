import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, db, COLLECTIONS } from '../services/firebase';
import {
  User,
  ParkingSlot,
  Ticket,
  TariffConfig,
  Shift,
  AuditLog,
  VehicleType,
  PaymentMethod,
  PaymentSplit,
  SlotStatus,
  ChileanCashBreakdown,
  CashMovement,
  Customer,
  ChecklistItem,
  TariffType,
  Agreement,
  TariffVersion,
  UserPermissions
} from '../types';
import {
  INITIAL_OPERATOR,
  INITIAL_ADMIN,
  INITIAL_SUPERVISOR,
  INITIAL_TARIFF_CONFIG,
  INITIAL_TARIFF_VERSIONS,
  INITIAL_SLOTS,
  INITIAL_TICKETS,
  INITIAL_SHIFT,
  INITIAL_AUDIT_LOGS,
  INITIAL_CUSTOMERS,
  INITIAL_AGREEMENTS,
  ROLE_PERMISSIONS,
} from '../data/mockData';
import { calculateStayFeeLey20967 } from '../services/tariffEngine';
import { emitFiscalDte, generateDailySalesReportRVD, DailySalesReportRVD } from '../services/fiscal/siiBillingService';
import { cordanoOfflineDB } from '../services/db/offlineStorage';
import { EscPosDriver } from '../services/hardware/escPosDriver';
import { generateShiftCryptographicSeal } from '../utils/cryptoSha256';

export const computeAgreementStatus = (validUntil: string): 'al_dia' | 'por_vencer' | 'vencido' => {
  const now = new Date();
  const until = new Date(validUntil);
  const diffMs = until.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'vencido';
  if (diffDays <= 7) return 'por_vencer';
  return 'al_dia';
};

interface StayCalculation {
  durationMinutes: number;
  subtotalAmount: number;
  totalAmount: number;
  isGracePeriod: boolean;
  nightSurcharge: number;
  weekendSurcharge: number;
}

const DEFAULT_CHECKLIST_TASKS: ChecklistItem[] = [
  { id: 'chk-1', label: 'Verificar el perímetro del recinto.', completed: false },
  { id: 'chk-2', label: 'Verificar los vehículos que están físicamente en el lugar (revisión de arrastre).', completed: false },
  { id: 'chk-3', label: 'Actualizar informaciones del sistema y estado de los vehículos.', completed: false },
  { id: 'chk-4', label: 'Revisar cámaras de seguridad.', completed: false },
  { id: 'chk-5', label: 'Verificar que el espacio de pago se encuentre limpio y ordenado para los clientes.', completed: false },
];

interface ParkingContextType {
  user: User;
  setUser: React.Dispatch<React.SetStateAction<User>>;
  setUserRole: (role: 'operador' | 'supervisor' | 'administrador') => void;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  isLoggedIn: boolean;
  setIsLoggedIn: (loggedIn: boolean) => void;
  logout: () => void;
  firebaseUser: FirebaseUser | null;
  loginWithFirebase: (email: string, password: string) => Promise<User>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  slots: ParkingSlot[];
  tickets: Ticket[];
  customers: Customer[];
  currentShift: Shift;
  isShiftOpen: boolean;
  isShiftOwner: boolean;
  isViewerOnly: boolean;
  tariffConfig: TariffConfig;
  tariffVersions: TariffVersion[];
  activeTariffVersion: TariffVersion;
  auditLogs: AuditLog[];
  
  pendingApprovals: any[];
  addPendingApproval: (payload: any) => void;
  resolvePendingApproval: (id: string, status: string) => void;
  isOffline: boolean;
  setIsOffline: React.Dispatch<React.SetStateAction<boolean>>;
  isFirebaseConnected: boolean;
  syncQueueCount: number;
  cashToleranceClp: number;
  keyboardShortcutsEnabled: boolean;
  setKeyboardShortcutsEnabled: (enabled: boolean) => void;
  
  // Checklist State & Actions
  checklistTasks: ChecklistItem[];
  isChecklistModalOpen: boolean;
  setIsChecklistModalOpen: (open: boolean) => void;
  toggleChecklistTask: (id: string) => void;
  completeChecklist: () => void;
  snoozeChecklist: () => void;
  checklistSnoozeRemainingSeconds: number;

  // Customer Actions
  saveCustomer: (customer: Customer) => void;
  findCustomerByPlate: (plate: string) => Customer | undefined;
  
  // Agreements (Abonados Mensuales & Convenios Comerciales)
  agreements: Agreement[];
  findAgreementByPlate: (plate: string) => Agreement | undefined;
  renewAgreement: (
    agreementId: string,
    renewalMonths: number,
    amountPaid: number,
    paymentMethod: string,
    voucherNumber: string,
    notes?: string
  ) => void;
  createAgreement: (agreementData: Omit<Agreement, 'id' | 'createdAt' | 'status'>) => Agreement;
  updateAgreement: (agreementId: string, updates: Partial<Agreement>) => void;
  deleteAgreement: (agreementId: string) => void;

  // Actions
  registerEntry: (
    paramsOrPlate:
      | {
          plateNumber: string;
          vehicleType: VehicleType;
          slotCode?: string;
          notes?: string;
          customerName?: string;
          customerPhone?: string;
          customerEmail?: string;
          tariffType?: TariffType;
        }
      | string,
    vehicleType?: VehicleType,
    slotCode?: string,
    notes?: string,
    customerData?: {
      name?: string;
      rut?: string;
      phone?: string;
      email?: string;
      agreementType?: TariffType;
    },
    tariffType?: TariffType
  ) => Ticket;
  assignSlotToTicket: (ticketId: string, slotCode: string) => void;
  moveOrSwapVehicleSlot: (sourceSlotNum: number, targetSlotNum: number) => boolean;
  calculateFee: (ticket: Ticket, customExitTime?: Date) => StayCalculation;
  validateAntiPassback: (plate: string) => {
    isBlocked: boolean;
    activeTicket?: Ticket;
    conflictingSlot?: ParkingSlot;
    message?: string;
  };
  processPayment: (params: {
    ticketId: string;
    paymentMethod: PaymentMethod;
    paidAmount: number;
    paymentSplits?: PaymentSplit[];
    discountAmount?: number;
    discountReason?: string;
    isLostTicket?: boolean;
    authorizedByAdmin?: string;
    voucherNumber?: string;
    invoiceFolio?: string;
  }) => { ticket: Ticket; changeAmount: number };
  cancelTicket: (ticketId: string, reason: string, adminPass: string) => boolean;
  updateSlotStatus: (slotCode: string, newStatus: SlotStatus) => void;
  updateTariffConfig: (newConfig: TariffConfig, reason?: string) => void;
  currentCashInDrawer: number;
  getCurrentCashInDrawer: () => number;
  registerCashDrop: (params: {
    amount: number;
    reason: string;
    supervisorPin: string;
    supervisorName?: string;
    destination?: string;
    requesterName?: string;
  }) => CashMovement;
  registerCashMovement: (
    type: 'INGRESO_MANUAL' | 'RETIRO_SANGRIA' | 'GASTO_MENOR',
    amount: number,
    reason: string,
    supervisorPin?: string,
    requesterName?: string,
    authorizerName?: string
  ) => CashMovement;
  registerVehicleEscape: (ticketId: string, notes: string, supervisorPin: string) => boolean;
  performBlindClose: (...args: any[]) => Shift;
  signShiftCopy: (copyType: 'caja' | 'operador') => void;
  addAuditLog: (action: AuditLog['action'], details: string, severity?: AuditLog['severity'], authorizedBy?: string) => void;
  openNewShift: (initialCash: number, breakdown?: ChileanCashBreakdown) => void;

  // Hardware & SII
  printEntryTicket: (ticket: Ticket) => Promise<boolean>;
  printFiscalReceipt: (ticket: Ticket) => Promise<boolean>;
  dailyRvd: DailySalesReportRVD | null;
  generateRvdReport: () => DailySalesReportRVD;
}

const ParkingContext = createContext<ParkingContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SLOTS: 'cordano_slots_v3',
  TICKETS: 'cordano_tickets_v3',
  SHIFT: 'cordano_shift_v3',
  TARIFF: 'cordano_tariff_v3',
  AUDIT: 'cordano_audit_v3',
  CUSTOMERS: 'cordano_customers_v3',
  CHECKLIST: 'cordano_checklist_v3',
  AGREEMENTS: 'cordano_agreements_v3',
  KEYBOARD_SHORTCUTS: 'cordano_keyboard_shortcuts_enabled',
};

// Limpieza automática de datos demo de versiones anteriores en localStorage
if (typeof window !== 'undefined' && !localStorage.getItem('cordano_demo_data_purged_v3')) {
  try {
    localStorage.removeItem('pms_matic_slots');
    localStorage.removeItem('pms_matic_tickets');
    localStorage.removeItem('pms_matic_shift');
    localStorage.removeItem('pms_matic_audit');
    localStorage.removeItem('pms_matic_customers');
    localStorage.removeItem('pms_matic_agreements');
    localStorage.removeItem('pms_matic_shift_history');
    localStorage.removeItem('pms_matic_offline_shifts');
    localStorage.removeItem('pms_matic_user_role');
    localStorage.removeItem('pms_matic_is_logged_in');
    localStorage.setItem('cordano_demo_data_purged_v3', 'true');
  } catch (e) {
    console.warn('Limpieza de caché de demostración completada:', e);
  }
}

export const ParkingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [keyboardShortcutsEnabled, setKeyboardShortcutsEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.KEYBOARD_SHORTCUTS);
    return saved !== null ? saved === 'true' : true;
  });

  const setKeyboardShortcutsEnabled = (enabled: boolean) => {
    setKeyboardShortcutsEnabledState(enabled);
    localStorage.setItem(STORAGE_KEYS.KEYBOARD_SHORTCUTS, enabled ? 'true' : 'false');
  };

  const [user, setUser] = useState<User>(() => {
    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('pms_matic_user_role');
      if (savedRole === 'operador') return INITIAL_OPERATOR;
      if (savedRole === 'supervisor') return INITIAL_SUPERVISOR;
      if (savedRole === 'administrador') return INITIAL_ADMIN;
    }
    return INITIAL_ADMIN;
  });
  const [isLoggedIn, setIsLoggedInState] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('pms_matic_is_logged_in') === 'true';
  });

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        setIsLoggedInState(true);
      }
    });
    return () => unsub();
  }, []);

  const loginWithFirebase = async (email: string, password: string): Promise<User> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    setFirebaseUser(userCredential.user);
    setIsLoggedIn(true);
    return user;
  };

  const setIsLoggedIn = (loggedIn: boolean) => {
    setIsLoggedInState(loggedIn);
    localStorage.setItem('pms_matic_is_logged_in', loggedIn ? 'true' : 'false');
  };

  const logout = () => {
    setIsLoggedInState(false);
    localStorage.setItem('pms_matic_is_logged_in', 'false');
    signOut(auth).catch(() => {});
  };

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [syncQueueCount, setSyncQueueCount] = useState<number>(0);

  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  const addPendingApproval = (payload: any) => {
    const newApproval = { id: Date.now().toString(), status: 'pending', ...payload };
    setPendingApprovals(prev => [...prev, newApproval]);
  };

  const resolvePendingApproval = (id: string, status: string) => {
    setPendingApprovals(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const cashToleranceClp = 2000; // Tolerancia estricta de $2.000 CLP según requerimiento de Bloque 6

  // Load initial state or localStorage
  const [slots, setSlots] = useState<ParkingSlot[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SLOTS);
    return saved ? JSON.parse(saved) : INITIAL_SLOTS;
  });

  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TICKETS);
    return saved ? JSON.parse(saved) : INITIAL_TICKETS;
  });

  const [currentShift, setCurrentShift] = useState<Shift>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHIFT);
    if (saved) {
      try {
        const parsed: Shift = JSON.parse(saved);
        return parsed;
      } catch (e) {
        console.error('Error al parsear turno guardado:', e);
      }
    }
    return INITIAL_SHIFT;
  });

  const [tariffConfig, setTariffConfig] = useState<TariffConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TARIFF);
    return saved ? JSON.parse(saved) : INITIAL_TARIFF_CONFIG;
  });

  const [tariffVersions, setTariffVersions] = useState<TariffVersion[]>(() => {
    const saved = localStorage.getItem('cordano_tariff_versions');
    return saved ? JSON.parse(saved) : INITIAL_TARIFF_VERSIONS;
  });

  const activeTariffVersion =
    tariffVersions.find((v) => !v.effectiveUntil) ||
    tariffVersions[tariffVersions.length - 1] ||
    INITIAL_TARIFF_VERSIONS[0];

  const [dailyRvd, setDailyRvd] = useState<DailySalesReportRVD | null>(null);

  useEffect(() => {
    localStorage.setItem('cordano_tariff_versions', JSON.stringify(tariffVersions));
  }, [tariffVersions]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AUDIT);
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [agreements, setAgreements] = useState<Agreement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AGREEMENTS);
    const rawList: Agreement[] = saved ? JSON.parse(saved) : INITIAL_AGREEMENTS;
    return rawList.map((agr) => ({
      ...agr,
      status: computeAgreementStatus(agr.validUntil),
    }));
  });

  const [checklistTasks, setChecklistTasks] = useState<ChecklistItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CHECKLIST);
    return saved ? JSON.parse(saved) : DEFAULT_CHECKLIST_TASKS;
  });

  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState<boolean>(false);
  const [checklistSnoozeRemainingSeconds, setChecklistSnoozeRemainingSeconds] = useState<number>(0);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SLOTS, JSON.stringify(slots));
  }, [slots]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHIFT, JSON.stringify(currentShift));
  }, [currentShift]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TARIFF, JSON.stringify(tariffConfig));
  }, [tariffConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AGREEMENTS, JSON.stringify(agreements));
  }, [agreements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CHECKLIST, JSON.stringify(checklistTasks));
  }, [checklistTasks]);

  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(true);

  // Helper para persistencia asíncrona en Firestore con cola de contingencia Outbox
  const persistToFirestore = async (collectionName: string, docId: string, data: any) => {
    try {
      const cleanData = JSON.parse(JSON.stringify(data));
      await setDoc(doc(db, collectionName, docId), cleanData, { merge: true });
      setIsFirebaseConnected(true);
    } catch (err: any) {
      setIsFirebaseConnected(false);
      // Encolar automáticamente en IndexedDB para sincronizar al volver la red
      cordanoOfflineDB.enqueueSyncItem(collectionName, docId, data, 'UPDATE').catch(console.warn);
    }
  };

  // Listeners en tiempo real para sincronización multidispotivo (tickets, slots, convenios, turnos, auditoría)
  useEffect(() => {
    let unsubTickets: (() => void) | undefined;
    let unsubSlots: (() => void) | undefined;
    let unsubAgreements: (() => void) | undefined;
    let unsubShifts: (() => void) | undefined;
    let unsubAuditLogs: (() => void) | undefined;

    try {
      // 1. Sincronización de tickets
      unsubTickets = onSnapshot(
        collection(db, COLLECTIONS.TICKETS),
        (snapshot) => {
          setIsFirebaseConnected(true);
          if (!snapshot.empty) {
            const remote: Ticket[] = [];
            snapshot.forEach((d) => remote.push(d.data() as Ticket));
            if (remote.length > 0) {
              remote.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
              setTickets(remote);
            }
          }
        },
        () => {
          setIsFirebaseConnected(false);
        }
      );

      // 2. Sincronización de las 30 plazas de Serrano 447
      unsubSlots = onSnapshot(
        collection(db, COLLECTIONS.SLOTS),
        (snapshot) => {
          if (!snapshot.empty) {
            const remote: ParkingSlot[] = [];
            snapshot.forEach((d) => remote.push(d.data() as ParkingSlot));
            if (remote.length > 0) {
              remote.sort((a, b) => a.code.localeCompare(b.code));
              setSlots(remote);
            }
          }
        },
        () => {
          setIsFirebaseConnected(false);
        }
      );

      // 3. Sincronización de convenios y abonados
      unsubAgreements = onSnapshot(
        collection(db, COLLECTIONS.AGREEMENTS),
        (snapshot) => {
          if (!snapshot.empty) {
            const remote: Agreement[] = [];
            snapshot.forEach((d) => {
              const item = d.data() as Agreement;
              remote.push({
                ...item,
                status: computeAgreementStatus(item.validUntil),
              });
            });
            if (remote.length > 0) {
              setAgreements(remote);
            }
          }
        },
        () => {
          setIsFirebaseConnected(false);
        }
      );

      // 4. Sincronización de turnos de caja
      unsubShifts = onSnapshot(
        collection(db, COLLECTIONS.SHIFTS),
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteShifts: Shift[] = [];
            snapshot.forEach((d) => remoteShifts.push(d.data() as Shift));
            if (remoteShifts.length > 0) {
              remoteShifts.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
              const activeRemote = remoteShifts.find((s) => s.status === 'abierto') || remoteShifts[0];
              if (activeRemote) {
                setCurrentShift(activeRemote);
              }
            }
          }
        },
        () => {
          setIsFirebaseConnected(false);
        }
      );

      // 5. Sincronización de bitácora de auditoría inmutable
      unsubAuditLogs = onSnapshot(
        collection(db, COLLECTIONS.AUDIT_LOGS),
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteLogs: AuditLog[] = [];
            snapshot.forEach((d) => remoteLogs.push(d.data() as AuditLog));
            if (remoteLogs.length > 0) {
              remoteLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
              setAuditLogs(remoteLogs);
            }
          }
        },
        () => {
          setIsFirebaseConnected(false);
        }
      );
    } catch {
      setIsFirebaseConnected(false);
    }

    // Manejador de reconexión de red para procesar transacciones encoladas offline
    const handleOnline = () => {
      setIsFirebaseConnected(true);
      cordanoOfflineDB.replayOutboxQueue(db).then((synced) => {
        if (synced > 0) {
          console.info(`[Cordano Outbox] ${synced} transacciones offline sincronizadas exitosamente con Firestore.`);
        }
      }).catch(console.warn);
    };

    const handleOffline = () => {
      setIsFirebaseConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Intentar replay inicial en arranque si hay conexión
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      cordanoOfflineDB.replayOutboxQueue(db).catch(console.warn);
    }

    return () => {
      unsubTickets?.();
      unsubSlots?.();
      unsubAgreements?.();
      unsubShifts?.();
      unsubAuditLogs?.();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Recurring 15-minute checklist snooze timer countdown
  useEffect(() => {
    if (checklistSnoozeRemainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setChecklistSnoozeRemainingSeconds((prev) => {
        if (prev <= 1) {
          // Time to trigger popup again if checklist is not completed
          if (!currentShift.checklistCompleted) {
            setIsChecklistModalOpen(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [checklistSnoozeRemainingSeconds, currentShift.checklistCompleted]);

  const setUserRole = (role: 'operador' | 'supervisor' | 'administrador') => {
    localStorage.setItem('pms_matic_user_role', role);
    const baseUser = role === 'operador' ? INITIAL_OPERATOR : role === 'supervisor' ? INITIAL_SUPERVISOR : INITIAL_ADMIN;
    setUser({
      ...baseUser,
      role,
      permissions: ROLE_PERMISSIONS[role],
    });
  };

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    if (!user) return false;
    // Incompatibilidad de Caja: Administrador y Supervisor tienen estrictamente VEDADA la operación de POS y caja
    if (permission === 'canOperatePos' || permission === 'canOpenCloseShift') {
      return user.role === 'operador';
    }
    // Solo Administrador puede configurar tarifas y parámetros del sistema
    if (permission === 'canConfigureSystem') {
      return user.role === 'administrador';
    }
    if (user.permissions && typeof user.permissions[permission] === 'boolean') {
      return user.permissions[permission];
    }
    if (user.role === 'administrador') return true;
    return false;
  };

  // Estado de turno y titularidad exclusiva del operador que lo abrió
  // Incompatibilidad de Caja: Los roles Administrador y Supervisor NUNCA pueden ser titulares (isShiftOwner) de caja
  const isShiftOpen = currentShift?.status === 'abierto';
  const isShiftOwner = isShiftOpen && user?.role === 'operador' && Boolean(
    (user?.id && currentShift?.operatorId === user.id) ||
    (user?.name && currentShift?.operatorName === user.name)
  );
  const isViewerOnly = isShiftOpen && !isShiftOwner;

  const addAuditLog = (
    action: AuditLog['action'],
    details: string,
    severity: AuditLog['severity'] = 'info',
    authorizedBy?: string
  ) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      action,
      details,
      severity,
      authorizedBy,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
    persistToFirestore(COLLECTIONS.AUDIT_LOGS, newLog.id, newLog);
    cordanoOfflineDB.saveAuditLog(newLog).catch(console.warn);

    if (isOffline) {
      setSyncQueueCount((c) => c + 1);
    }
  };

  const saveCustomer = (customer: Customer) => {
    setCustomers((prev) => {
      const existsIndex = prev.findIndex(
        (c) => c.plateNumber.toUpperCase() === customer.plateNumber.toUpperCase()
      );
      if (existsIndex >= 0) {
        const copy = [...prev];
        copy[existsIndex] = { ...customer, plateNumber: customer.plateNumber.toUpperCase() };
        return copy;
      }
      return [{ ...customer, id: `cust-${Date.now()}`, plateNumber: customer.plateNumber.toUpperCase() }, ...prev];
    });

    addAuditLog(
      'CLIENTE_REGISTRADO',
      `Ficha de cliente guardada/actualizada para patente ${customer.plateNumber.toUpperCase()} (${customer.name})`,
      'info'
    );
  };

  const findCustomerByPlate = (plate: string): Customer | undefined => {
    const clean = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return customers.find(
      (c) => c.plateNumber.replace(/[^A-Z0-9]/g, '').toUpperCase() === clean
    );
  };

  const findAgreementByPlate = (plate: string): Agreement | undefined => {
    const clean = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return agreements.find(
      (a) => a.plateNumber.replace(/[^A-Z0-9]/g, '').toUpperCase() === clean
    );
  };

  const renewAgreement = (
    agreementId: string,
    renewalMonths: number,
    amountPaid: number,
    paymentMethod: string,
    voucherNumber: string,
    notes?: string
  ) => {
    const target = agreements.find((a) => a.id === agreementId);
    if (!target) return;

    // Calcular nueva fecha de vigencia
    const currentValidUntil = new Date(target.validUntil);
    const baseDate = currentValidUntil.getTime() > Date.now() ? currentValidUntil : new Date();
    baseDate.setMonth(baseDate.getMonth() + renewalMonths);
    const newValidUntil = baseDate.toISOString();
    const newStatus = computeAgreementStatus(newValidUntil);

    setAgreements((prev) =>
      prev.map((a) =>
        a.id === agreementId
          ? {
              ...a,
              validUntil: newValidUntil,
              status: newStatus,
              lastPaymentDate: new Date().toISOString(),
              lastPaymentAmount: amountPaid,
              lastPaymentMethod: paymentMethod,
              lastPaymentVoucher: voucherNumber,
              notes: notes || a.notes,
            }
          : a
      )
    );

    persistToFirestore(COLLECTIONS.AGREEMENTS, target.id, {
      ...target,
      validUntil: newValidUntil,
      status: newStatus,
      lastPaymentDate: new Date().toISOString(),
      lastPaymentAmount: amountPaid,
      lastPaymentMethod: paymentMethod,
      lastPaymentVoucher: voucherNumber,
      notes: notes || target.notes,
    });

    addAuditLog(
      'CLIENTE_REGISTRADO',
      `Suscripción de convenio renovada para patente ${target.plateNumber} (${target.companyName}) por ${renewalMonths} mes(es). Monto: $${amountPaid.toLocaleString('es-CL')} CLP vía ${paymentMethod}. Comprobante: ${voucherNumber}`,
      'info'
    );
  };

  const createAgreement = (agreementData: Omit<Agreement, 'id' | 'createdAt' | 'status'>): Agreement => {
    const newAgreement: Agreement = {
      ...agreementData,
      id: `agr-${Date.now()}`,
      plateNumber: agreementData.plateNumber.trim().toUpperCase(),
      status: computeAgreementStatus(agreementData.validUntil),
      createdAt: new Date().toISOString(),
    };

    setAgreements((prev) => [newAgreement, ...prev]);
    persistToFirestore(COLLECTIONS.AGREEMENTS, newAgreement.id, newAgreement);

    // Asociar a clientes también para persistencia unificada
    saveCustomer({
      id: `cust-${Date.now()}`,
      plateNumber: newAgreement.plateNumber,
      name: `${newAgreement.contactName} (${newAgreement.companyName})`,
      phone: newAgreement.phone,
      email: newAgreement.email,
      rut: newAgreement.rutCompany,
      agreementType: newAgreement.agreementType,
      isSpecialRate: true,
      notes: newAgreement.notes,
    });

    addAuditLog(
      'CLIENTE_REGISTRADO',
      `Nuevo vehículo incorporado a convenio/abonado: Patente ${newAgreement.plateNumber} a nombre de ${newAgreement.companyName}. Cuota mensual: $${newAgreement.monthlyFeeClp.toLocaleString('es-CL')} CLP`,
      'info'
    );

    return newAgreement;
  };

  const updateAgreement = (agreementId: string, updates: Partial<Agreement>) => {
    setAgreements((prev) =>
      prev.map((a) => {
        if (a.id !== agreementId) return a;
        const updated = { ...a, ...updates };
        if (updates.validUntil) {
          updated.status = computeAgreementStatus(updates.validUntil);
        }
        return updated;
      })
    );
  };

  const deleteAgreement = (agreementId: string) => {
    const target = agreements.find((a) => a.id === agreementId);
    setAgreements((prev) => prev.filter((a) => a.id !== agreementId));
    if (target) {
      addAuditLog(
        'CLIENTE_REGISTRADO',
        `Vehículo de convenio ${target.plateNumber} (${target.companyName}) eliminado del registro`,
        'warning'
      );
    }
  };

  const toggleChecklistTask = (id: string) => {
    setChecklistTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const completeChecklist = () => {
    setChecklistTasks((prev) => prev.map((t) => ({ ...t, completed: true })));
    setCurrentShift((prev) => ({
      ...prev,
      checklistCompleted: true,
      checklistCompletedAt: new Date().toISOString(),
    }));
    setIsChecklistModalOpen(false);
    setChecklistSnoozeRemainingSeconds(0);

    addAuditLog(
      'CHECKLIST_APERTURA',
      `Chequeo de apertura completado exitosamente por ${user.name}. Las 5 verificaciones de perímetro, arrastre, cámaras y POS fueron auditadas.`,
      'info'
    );
  };

  const snoozeChecklist = () => {
    // 15 minutes = 900 seconds
    setChecklistSnoozeRemainingSeconds(900);
    setIsChecklistModalOpen(false);
    setCurrentShift((prev) => ({
      ...prev,
      lastChecklistSnoozeAt: new Date().toISOString(),
      checklistSnoozeMinutes: (prev.checklistSnoozeMinutes || 0) + 15,
    }));

    addAuditLog(
      'CHECKLIST_APERTURA',
      `Chequeo de apertura pospuesto por ${user.name}. Recordatorio programado automáticamente para 15 minutos.`,
      'warning'
    );
  };

  const validateAntiPassback = (plate: string): {
    isBlocked: boolean;
    activeTicket?: Ticket;
    conflictingSlot?: ParkingSlot;
    message?: string;
  } => {
    const clean = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return { isBlocked: false };

    const activeTicket = tickets.find(
      (t) => t.status === 'activo' && t.plateNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === clean
    );
    const conflictingSlot = slots.find(
      (s) => s.status === 'ocupado' && s.plateNumber && s.plateNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === clean
    );

    if (activeTicket || conflictingSlot) {
      const ticketRef = activeTicket?.ticketCode || activeTicket?.id || 'Activo';
      const slotRef = (activeTicket?.slotCode && activeTicket.slotCode !== 'SIN_ASIGNAR')
        ? activeTicket.slotCode
        : (conflictingSlot?.code || 'Patio');
      return {
        isBlocked: true,
        activeTicket,
        conflictingSlot,
        message: `[Anti-Passback] La patente ${plate.toUpperCase()} ya cuenta con ticket activo (${ticketRef}, Plaza ${slotRef}).`,
      };
    }

    return { isBlocked: false };
  };

  const registerEntry = (
    paramsOrPlate:
      | {
          plateNumber: string;
          vehicleType: VehicleType;
          slotCode?: string;
          notes?: string;
          customerName?: string;
          customerPhone?: string;
          customerEmail?: string;
          tariffType?: TariffType;
        }
      | string,
    posVehicleType?: VehicleType,
    posSlotCode?: string,
    posNotes?: string,
    posCustomerData?: {
      name?: string;
      rut?: string;
      phone?: string;
      email?: string;
      agreementType?: TariffType;
    },
    posTariffType?: TariffType
  ): Ticket => {
    let plateNumber: string;
    let vehicleType: VehicleType;
    let slotCode: string;
    let notes: string | undefined;
    let customerName: string | undefined;
    let customerPhone: string | undefined;
    let customerEmail: string | undefined;
    let customerRut: string | undefined;
    let tariffType: TariffType = 'estandar';

    if (typeof paramsOrPlate === 'object') {
      plateNumber = paramsOrPlate.plateNumber;
      vehicleType = paramsOrPlate.vehicleType;
      slotCode = paramsOrPlate.slotCode || 'SIN_ASIGNAR';
      notes = paramsOrPlate.notes;
      customerName = paramsOrPlate.customerName;
      customerPhone = paramsOrPlate.customerPhone;
      customerEmail = paramsOrPlate.customerEmail;
      tariffType = paramsOrPlate.tariffType || 'estandar';
    } else {
      plateNumber = paramsOrPlate;
      vehicleType = posVehicleType || 'Automóvil';
      slotCode = posSlotCode || 'SIN_ASIGNAR';
      notes = posNotes;
      customerName = posCustomerData?.name;
      customerPhone = posCustomerData?.phone;
      customerEmail = posCustomerData?.email;
      customerRut = posCustomerData?.rut;
      tariffType = posTariffType || posCustomerData?.agreementType || 'estandar';
    }

    const formattedPlate = plateNumber.trim().toUpperCase();
    const cleanPlate = formattedPlate.replace(/[^A-Z0-9]/g, '');

    if (!cleanPlate) {
      throw new Error('La patente ingresada no es válida.');
    }

    // 1. Validar que el turno esté abierto obligatoriamente
    if (!currentShift || currentShift.status !== 'abierto') {
      throw new Error('Punto de Venta Bloqueado: No es posible ingresar vehículos sin un turno iniciado. Es obligatorio aperturar el turno con el fondo de caja.');
    }

    // 2. Incompatibilidad de Caja: Administrador y Supervisor tienen VEDADA la operación de garita POS
    if (user.role !== 'operador' || !hasPermission('canOperatePos')) {
      throw new Error('Incompatibilidad de Caja: Administradores y Supervisores tienen estrictamente VEDADA la operación de caja y el registro de vehículos en POS (Solo modo Visor / Auditoría).');
    }

    // 3. Dominio exclusivo: solo el titular que abrió el turno puede ingresar vehículos
    if (currentShift.operatorId && user.id !== currentShift.operatorId && user.name !== currentShift.operatorName) {
      throw new Error(`Acceso Restringido: El turno actual pertenece a ${currentShift.operatorName}. Solo el titular del turno puede registrar vehículos. Los demás usuarios operan en modo solo visualizador.`);
    }

    // 3. Validación estricta Anti-Passback (Estándar SKIDATA / Odoo POS):
    // Bloquear cualquier intento de Check-in para una patente que ya figure con un ticket activo en el patio de Serrano 447
    const existingActive = tickets.find(
      (t) => t.status === 'activo' && t.plateNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanPlate
    );
    const existingOccupiedSlot = slots.find(
      (s) => s.status === 'ocupado' && s.plateNumber && s.plateNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanPlate
    );

    if (existingActive || existingOccupiedSlot) {
      const ticketRef = existingActive?.ticketCode || existingActive?.id || 'Activo';
      const slotRef = (existingActive?.slotCode && existingActive.slotCode !== 'SIN_ASIGNAR')
        ? existingActive.slotCode
        : (existingOccupiedSlot?.code || 'Patio Serrano 447');
      const entryTimeRef = existingActive
        ? new Date(existingActive.entryTime).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        : 'reciente';

      // Registro en bitácora de auditoría inmutable
      addAuditLog(
        'VIOLACION_ANTI_PASSBACK',
        `[Anti-Passback SKIDATA] Intento de reingreso no autorizado bloqueado para patente ${formattedPlate}. Vehículo ya presente en Ticket ${ticketRef} (Plaza ${slotRef}, Ingreso ${entryTimeRef} hrs).`,
        'critical',
        user.name
      );

      throw new Error(
        `[Anti-Passback SKIDATA] Acceso Denegado: La patente ${formattedPlate} ya registra una entrada activa en el patio de Serrano 447 (Ticket: ${ticketRef}, Plaza: ${slotRef}, Ingreso: ${entryTimeRef} hrs). Debe registrar su salida antes de generar un nuevo ingreso.`
      );
    }

    const nowIso = new Date().toISOString();
    const ticketCode = `T-${Math.floor(10000 + Math.random() * 90000)}`;

    const activeRate = tariffConfig.vehicleRates[vehicleType] || tariffConfig.vehicleRates['Automóvil'];

    const newTicket: Ticket = {
      id: `t-${Date.now()}`,
      ticketCode,
      plateNumber: formattedPlate,
      vehicleType,
      entryTime: nowIso,
      slotCode: slotCode || 'SIN_ASIGNAR',
      status: 'activo',
      notes,
      customerName,
      customerPhone,
      customerEmail,
      tariffType: tariffType === 'convenio' || tariffType === 'especial' ? 'especial' : 'estandar',
      tariffVersionId: activeTariffVersion.id,
      frozenRate: { ...activeRate },
      frozenBillingModel: tariffConfig.billingModel,
      isLostTicketResolvedByPlate: false,
      operatorEntryName: user.name,
    };

    setTickets((prev) => [newTicket, ...prev]);
    persistToFirestore(COLLECTIONS.TICKETS, newTicket.id, newTicket);
    cordanoOfflineDB.saveTicket(newTicket).catch(console.warn);

    // Update slot status if assigned directly
    if (slotCode && slotCode !== 'SIN_ASIGNAR') {
      const slotUpdate = {
        code: slotCode,
        status: 'ocupado' as SlotStatus,
        currentTicketId: newTicket.id,
        occupiedSince: nowIso,
        plateNumber: formattedPlate,
      };
      setSlots((prev) =>
        prev.map((s) =>
          s.code === slotCode ? { ...s, ...slotUpdate } : s
        )
      );
      persistToFirestore(COLLECTIONS.SLOTS, slotCode, slotUpdate);
    }

    // Auto-save customer if provided
    if (customerName || customerPhone || customerRut) {
      saveCustomer({
        id: `cust-${Date.now()}`,
        plateNumber: formattedPlate,
        name: customerName || `Cliente ${formattedPlate}`,
        rut: customerRut,
        phone: customerPhone || '+569',
        email: customerEmail,
        agreementType: tariffType,
        isSpecialRate: tariffType !== 'estandar',
      });
    }

    addAuditLog(
      'APERTURA_PASO',
      `Ingreso registrado de patente ${formattedPlate} (${vehicleType}) en ${slotCode === 'SIN_ASIGNAR' ? 'cola sin asignar' : `slot ${slotCode}`}. Ticket: ${ticketCode}`
    );

    if (isOffline) {
      setSyncQueueCount((c) => c + 1);
    }

    return newTicket;
  };

  const assignSlotToTicket = (ticketId: string, slotCode: string) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error('Ticket no encontrado');

    const targetSlot = slots.find((s) => s.code === slotCode);
    if (!targetSlot) throw new Error('Espacio / Slot no encontrado');
    if (targetSlot.status !== 'disponible') {
      throw new Error(`El slot ${slotCode} se encuentra ${targetSlot.status}`);
    }

    // Update ticket
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, slotCode } : t))
    );

    // Update slot
    setSlots((prev) =>
      prev.map((s) =>
        s.code === slotCode
          ? {
              ...s,
              status: 'ocupado',
              currentTicketId: ticket.id,
              occupiedSince: ticket.entryTime,
              plateNumber: ticket.plateNumber,
            }
          : s
      )
    );

    addAuditLog(
      'ASIGNACION_SLOT',
      `Vehículo ${ticket.plateNumber} asignado exitosamente al slot ${slotCode} por ${user.name}`
    );
  };

  const moveOrSwapVehicleSlot = (sourceSlotNum: number, targetSlotNum: number): boolean => {
    if (sourceSlotNum === targetSlotNum) return false;

    // 1. Validar turno abierto
    if (!currentShift || currentShift.status !== 'abierto') {
      throw new Error('Punto de Venta Bloqueado: No se pueden reubicar vehículos sin un turno iniciado.');
    }
    // 2. Validar titularidad exclusiva
    if (isViewerOnly) {
      throw new Error(`Modo Solo Visualización: Solo ${currentShift.operatorName || 'el titular'} puede reubicar vehículos en el patio.`);
    }

    const sourceSlotCode = sourceSlotNum <= 15 ? `A-${String(sourceSlotNum).padStart(2, '0')}` : `B-${String(sourceSlotNum).padStart(2, '0')}`;
    const targetSlotCode = targetSlotNum <= 15 ? `A-${String(targetSlotNum).padStart(2, '0')}` : `B-${String(targetSlotNum).padStart(2, '0')}`;

    // Buscar ticket activo en el cupo origen
    const sourceTicket = tickets.find((t) => t.status === 'activo' && (
      t.slotCode === sourceSlotCode || 
      parseInt(t.slotCode?.replace(/\D/g, '') || '0', 10) === sourceSlotNum
    ));

    if (!sourceTicket) {
      return false;
    }

    // Verificar si el cupo destino ya tiene otro vehículo
    const targetTicket = tickets.find((t) => t.status === 'activo' && (
      t.slotCode === targetSlotCode || 
      parseInt(t.slotCode?.replace(/\D/g, '') || '0', 10) === targetSlotNum
    ));

    if (targetTicket) {
      // SWAP: Intercambiar plazas entre ambos vehículos
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id === sourceTicket.id) return { ...t, slotCode: targetSlotCode };
          if (t.id === targetTicket.id) return { ...t, slotCode: sourceSlotCode };
          return t;
        })
      );

      setSlots((prev) =>
        prev.map((s) => {
          if (s.code === sourceSlotCode) {
            return {
              ...s,
              status: 'ocupado',
              currentTicketId: targetTicket.id,
              plateNumber: targetTicket.plateNumber,
              occupiedSince: targetTicket.entryTime,
            };
          }
          if (s.code === targetSlotCode) {
            return {
              ...s,
              status: 'ocupado',
              currentTicketId: sourceTicket.id,
              plateNumber: sourceTicket.plateNumber,
              occupiedSince: sourceTicket.entryTime,
            };
          }
          return s;
        })
      );

      addAuditLog(
        'REUBICACION_VEHICULO' as any,
        `Permuta de plazas 2D: Vehículo ${sourceTicket.plateNumber} movido a ${targetSlotCode} y ${targetTicket.plateNumber} a ${sourceSlotCode}.`,
        'info',
        user?.name
      );
    } else {
      // MOVE: Mover al cupo vacío de destino
      setTickets((prev) =>
        prev.map((t) => (t.id === sourceTicket.id ? { ...t, slotCode: targetSlotCode } : t))
      );

      setSlots((prev) =>
        prev.map((s) => {
          if (s.code === sourceSlotCode) {
            return {
              ...s,
              status: 'disponible',
              currentTicketId: undefined,
              plateNumber: undefined,
              occupiedSince: undefined,
            };
          }
          if (s.code === targetSlotCode) {
            return {
              ...s,
              status: 'ocupado',
              currentTicketId: sourceTicket.id,
              plateNumber: sourceTicket.plateNumber,
              occupiedSince: sourceTicket.entryTime,
            };
          }
          return s;
        })
      );

      addAuditLog(
        'REUBICACION_VEHICULO' as any,
        `Reubicación vehicular en patio: ${sourceTicket.plateNumber} trasladado de ${sourceSlotCode} a plaza ${targetSlotCode}.`,
        'info',
        user?.name
      );
    }

    return true;
  };

  const calculateFee = (ticket: Ticket, customExitTime?: Date): StayCalculation => {
    // Delegar al Motor Oficial conforme a la Ley N° 20.967 con soporte de versión inmutable
    const result = calculateStayFeeLey20967(ticket, tariffConfig, customExitTime, activeTariffVersion);
    return {
      durationMinutes: result.durationMinutes,
      subtotalAmount: result.subtotalAmount,
      totalAmount: result.totalAmount,
      isGracePeriod: result.isGracePeriod,
      nightSurcharge: result.nightSurcharge,
      weekendSurcharge: result.weekendSurcharge,
    };
  };

  const processPayment = (params: {
    ticketId: string;
    paymentMethod: PaymentMethod;
    paidAmount: number;
    paymentSplits?: PaymentSplit[];
    discountAmount?: number;
    discountReason?: string;
    isLostTicket?: boolean;
    authorizedByAdmin?: string;
    voucherNumber?: string;
    invoiceFolio?: string;
  }) => {
    const {
      ticketId,
      paymentMethod,
      paidAmount,
      paymentSplits,
      discountAmount = 0,
      discountReason,
      isLostTicket = false,
      authorizedByAdmin,
      voucherNumber,
      invoiceFolio,
    } = params;

    // 1. Validar que el turno esté abierto obligatoriamente
    if (!currentShift || currentShift.status !== 'abierto') {
      throw new Error('Punto de Venta Bloqueado: No es posible procesar cobros ni liquidar salidas sin un turno iniciado.');
    }

    // 2. Incompatibilidad de Caja: Administrador y Supervisor tienen estrictamente VEDADO el cobro en garita POS
    if (user.role !== 'operador' || !hasPermission('canOperatePos')) {
      throw new Error('Incompatibilidad de Caja: Administradores y Supervisores tienen estrictamente VEDADO el cobro en garita POS para preservar la imparcialidad del arqueo (Solo Modo Visor).');
    }

    // 3. Dominio exclusivo: solo el titular del turno puede procesar cobros
    if (currentShift.operatorId && user.id !== currentShift.operatorId && user.name !== currentShift.operatorName) {
      throw new Error(`Acceso Restringido: El turno actual pertenece a ${currentShift.operatorName}. Solo el titular del turno puede liquidar cobros. Los demás usuarios operan en modo solo visualizador.`);
    }

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) {
      throw new Error('Ticket no encontrado');
    }

    const exitIso = new Date().toISOString();
    let { durationMinutes, totalAmount: computedAmount } = calculateFee(ticket, new Date(exitIso));

    // Conforme a la Ley 20.967, ante pérdida de ticket el cobro se realiza estrictamente por tiempo efectivo rastreado por patente, sin multas punitivas fijas.
    const finalTotal = Math.max(0, computedAmount - discountAmount);

    // Soporte para métodos de pago mixtos / desglose detallado (Odoo POS / SAP Business One)
    let effectivePaymentMethod: PaymentMethod = paymentMethod;
    let validatedSplits: PaymentSplit[] | undefined = paymentSplits;

    if (paymentSplits && paymentSplits.length > 0) {
      paymentSplits.forEach((split) => {
        if (split.amount <= 0) {
          throw new Error(`El monto asignado al medio de pago ${split.method} debe ser mayor a $0 CLP.`);
        }
      });

      const totalSplitPaid = paymentSplits.reduce((acc, s) => acc + s.amount, 0);
      if (totalSplitPaid < finalTotal) {
        throw new Error(
          `Desglose de pago insuficiente: La suma de los métodos de pago ingresados ($${totalSplitPaid.toLocaleString('es-CL')}) no cubre el total liquidado ($${finalTotal.toLocaleString('es-CL')}).`
        );
      }

      if (paymentSplits.length > 1) {
        effectivePaymentMethod = 'mixto';
      } else {
        effectivePaymentMethod = paymentSplits[0].method;
      }
    }

    const effectivePaidAmount = paymentSplits && paymentSplits.length > 0
      ? paymentSplits.reduce((acc, s) => acc + s.amount, 0)
      : paidAmount;

    const changeAmount = Math.max(0, effectivePaidAmount - finalTotal);

    if (effectivePaidAmount < finalTotal) {
      throw new Error(`El monto pagado ($${effectivePaidAmount.toLocaleString('es-CL')}) es inferior al total a cobrar ($${finalTotal.toLocaleString('es-CL')})`);
    }

    // Emisión obligatoria de Boleta Electrónica SII (Tipo 39 Afecta o 41 Exenta) con Timbre Electrónico DTE (<TED>)
    const fiscalDoc = emitFiscalDte(
      {
        ...ticket,
        totalAmount: finalTotal,
        durationMinutes,
        invoiceFolio,
      },
      tariffConfig.taxDocumentType
    );

    const updatedTicket: Ticket = {
      ...ticket,
      exitTime: exitIso,
      durationMinutes,
      subtotalAmount: computedAmount,
      discountAmount,
      discountReason,
      isLostTicket,
      isLostTicketResolvedByPlate: isLostTicket,
      totalAmount: finalTotal,
      paidAmount: effectivePaidAmount,
      changeAmount,
      paymentMethod: effectivePaymentMethod,
      paymentSplits: validatedSplits,
      voucherNumber,
      invoiceFolio: fiscalDoc.folio,
      dteFolio: fiscalDoc.folio,
      dteType: fiscalDoc.documentType,
      tedXml: fiscalDoc.tedXml,
      status: 'pagado',
      operatorExitName: user.name,
    };

    // Update state
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? updatedTicket : t)));
    persistToFirestore(COLLECTIONS.TICKETS, updatedTicket.id, updatedTicket);
    cordanoOfflineDB.saveTicket(updatedTicket).catch(console.warn);

    if (isOffline) {
      cordanoOfflineDB.enqueueSyncItem('tickets', updatedTicket.id, updatedTicket, 'UPDATE').catch(console.warn);
    }

    // Free slot
    if (ticket.slotCode && ticket.slotCode !== 'SIN_ASIGNAR') {
      const slotRelease = {
        code: ticket.slotCode,
        status: 'disponible' as SlotStatus,
        currentTicketId: null,
        occupiedSince: null,
        plateNumber: null,
      };
      setSlots((prev) =>
        prev.map((s) =>
          s.code === ticket.slotCode || s.currentTicketId === ticketId
            ? { ...s, ...slotRelease, currentTicketId: undefined, occupiedSince: undefined, plateNumber: undefined }
            : s
        )
      );
      persistToFirestore(COLLECTIONS.SLOTS, ticket.slotCode, slotRelease);
    }

    // Audit log
    if (discountAmount > 0) {
      addAuditLog(
        'DESCUENTO_MANUAL',
        `Descuento de $${discountAmount.toLocaleString('es-CL')} CLP aplicado al Ticket ${ticket.ticketCode} (${ticket.plateNumber}). Motivo: ${discountReason || 'Convenio'}`,
        'warning',
        authorizedByAdmin || user.name
      );
    }

    if (isLostTicket) {
      addAuditLog(
        'SOBREESCRITURA_SALIDA',
        `Salida por Ticket Extraviado para patente ${ticket.plateNumber}. Conforme a Ley 20.967, se cobró tiempo efectivo real (${durationMinutes} min = $${finalTotal.toLocaleString('es-CL')} CLP) sin multas punitivas.`,
        'warning',
        authorizedByAdmin || user.name
      );
    }

    addAuditLog(
      'APERTURA_PASO',
      `Cobro procesado exitosamente: Ticket ${ticket.ticketCode} ($${finalTotal.toLocaleString('es-CL')} CLP - ${paymentMethod}${voucherNumber ? ` Voucher ${voucherNumber}` : ''}). Slot ${ticket.slotCode} liberado.`
    );

    if (isOffline) {
      setSyncQueueCount((c) => c + 1);
    }

    return { ticket: updatedTicket, changeAmount };
  };

  const cancelTicket = (ticketId: string, reason: string, adminPass: string): boolean => {
    if (adminPass !== 'admin123' && adminPass !== '1234' && adminPass !== '2026') {
      throw new Error('Clave de administrador incorrecta para anulación');
    }

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return false;

    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: 'anulado', notes: `Anulado: ${reason}` } : t))
    );

    // Free slot if occupied by this ticket
    setSlots((prev) =>
      prev.map((s) =>
        s.currentTicketId === ticketId
          ? { ...s, status: 'disponible', currentTicketId: undefined, occupiedSince: undefined, plateNumber: undefined }
          : s
      )
    );

    addAuditLog(
      'ANULACION_TICKET',
      `Ticket ${ticket.ticketCode} (${ticket.plateNumber}) ANULADO. Motivo: ${reason}`,
      'critical',
      'María González (Supervisor)'
    );

    return true;
  };

  const updateSlotStatus = (slotCode: string, newStatus: SlotStatus) => {
    setSlots((prev) =>
      prev.map((s) => (s.code === slotCode ? { ...s, status: newStatus } : s))
    );
  };

  const updateTariffConfig = (newConfig: TariffConfig, reason?: string) => {
    // RBAC: Solo rol Administrador con canConfigureSystem puede alterar tarifas o parámetros
    if (user.role === 'operador' || !hasPermission('canConfigureSystem')) {
      throw new Error('Acceso Denegado: Los operadores no tienen permisos para modificar tarifas horarias ni alterar parámetros del sistema.');
    }

    const nowIso = new Date().toISOString();
    const newVersionNumber = tariffVersions.length + 1;
    const newVersionId = `tar-v${newVersionNumber}-${Date.now()}`;

    // Cerrar vigencia de la versión previa activa
    const updatedVersions = tariffVersions.map((v) =>
      !v.effectiveUntil ? { ...v, effectiveUntil: nowIso } : v
    );

    const newVersion: TariffVersion = {
      id: newVersionId,
      versionNumber: newVersionNumber,
      effectiveFrom: nowIso,
      billingModel: newConfig.billingModel,
      taxDocumentType: newConfig.taxDocumentType,
      gracePeriodMinutes: newConfig.gracePeriodMinutes,
      nightSurchargePercent: newConfig.nightSurchargePercent,
      weekendSurchargePercent: newConfig.weekendSurchargePercent,
      vehicleRates: newConfig.vehicleRates,
      subsequentTrancheRates: newConfig.subsequentTrancheRates,
      createdBy: user.name,
      reason: reason || 'Actualización de tarifa autorizada por Administración',
    };

    const finalVersions = [...updatedVersions, newVersion];
    setTariffVersions(finalVersions);
    localStorage.setItem('cordano_tariff_versions', JSON.stringify(finalVersions));
    cordanoOfflineDB.saveTariffVersion(newVersion).catch(console.warn);

    const configWithActiveVersion = {
      ...newConfig,
      activeVersionId: newVersionId,
    };
    setTariffConfig(configWithActiveVersion);
    localStorage.setItem(STORAGE_KEYS.TARIFF, JSON.stringify(configWithActiveVersion));

    addAuditLog(
      'CAMBIO_TARIFA',
      `Nueva versión tarifaria inmutable v${newVersionNumber} publicada por ${user.name}. Modalidad: ${newConfig.billingModel}, Gracia: ${newConfig.gracePeriodMinutes}m, DTE: Boleta Tipo ${newConfig.taxDocumentType}. Los vehículos activos en patio conservan su tarifa congelada.`,
      'warning'
    );
  };

  const getCurrentCashInDrawer = (): number => {
    if (!currentShift) return 0;
    const initial = currentShift.initialCash || 0;

    // Sum cash from paid tickets during current shift (handling paymentSplits as well)
    const paidTickets = tickets.filter((t) => t.status === 'pagado');
    const cashFromTickets = paidTickets.reduce((sum, t) => {
      if (t.paymentSplits && t.paymentSplits.length > 0) {
        const cashSplit = t.paymentSplits
          .filter((s) => s.method === 'efectivo')
          .reduce((sSum, s) => sSum + s.amount, 0);
        return sum + cashSplit;
      }
      return sum + (t.paymentMethod === 'efectivo' ? (t.totalAmount || 0) : 0);
    }, 0);

    // Sum manual cash movements
    const movements = currentShift.cashMovements || [];
    const manualIngresos = movements
      .filter((m) => m.type === 'INGRESO_MANUAL')
      .reduce((sum, m) => sum + m.amount, 0);
    const manualSangrias = movements
      .filter((m) => m.type === 'RETIRO_SANGRIA' || m.type === 'GASTO_MENOR')
      .reduce((sum, m) => sum + m.amount, 0);

    return Math.max(0, initial + cashFromTickets + manualIngresos - manualSangrias);
  };

  const currentCashInDrawer = getCurrentCashInDrawer();

  const registerCashDrop = (params: {
    amount: number;
    reason: string;
    supervisorPin: string;
    supervisorName?: string;
    destination?: string;
    requesterName?: string;
  }): CashMovement => {
    const {
      amount,
      reason,
      supervisorPin,
      supervisorName,
      destination = 'Administración Central / Bóveda Cordano',
      requesterName,
    } = params;

    if (amount <= 0) {
      throw new Error('El monto de la sangría debe ser superior a $0 CLP');
    }

    if (!currentShift || currentShift.status !== 'abierto') {
      throw new Error('Caja Bloqueada: No se pueden realizar sangrías de efectivo sin un turno activo.');
    }

    if (currentShift.operatorId && user.id !== currentShift.operatorId && user.name !== currentShift.operatorName) {
      throw new Error(`Acceso Restringido: Solo el titular del turno (${currentShift.operatorName}) puede autorizar retiros de efectivo.`);
    }

    const availableCash = getCurrentCashInDrawer();
    if (amount > availableCash) {
      throw new Error(
        `[Cash Drop] Fondos Insuficientes: La sangría solicitada ($${amount.toLocaleString('es-CL')} CLP) excede el efectivo físico disponible en gaveta ($${availableCash.toLocaleString('es-CL')} CLP).`
      );
    }

    const cleanPin = supervisorPin.trim();
    const isValidPin = cleanPin === '1234' || cleanPin === '2026' || cleanPin === 'admin123';
    if (!isValidPin) {
      throw new Error('PIN de Supervisor inválido para autorizar la sangría de efectivo.');
    }

    const cashBefore = availableCash;
    const cashAfter = availableCash - amount;
    const voucherFolio = `SANG-${Math.floor(10000 + Math.random() * 90000)}`;

    const newMovement: CashMovement = {
      id: `mov-${Date.now()}`,
      shiftId: currentShift.id,
      timestamp: new Date().toISOString(),
      type: 'RETIRO_SANGRIA',
      amount,
      reason: reason || 'Retiro parcial de efectivo (Cash Drop) a administración por seguridad',
      operatorId: user.id,
      operatorName: user.name,
      requesterName: requesterName || user.name,
      authorizerName: supervisorName || 'Supervisor Autorizante',
      authorizedBySupervisor: `Supervisor (${supervisorName || 'PIN Validado'})`,
      supervisorTotpPin: cleanPin,
      voucherFolio,
      destination,
      cashInDrawerBefore: cashBefore,
      cashInDrawerAfter: cashAfter,
      isCashDrop: true,
    };

    setCurrentShift((prev) => ({
      ...prev,
      cashMovements: [...(prev.cashMovements || []), newMovement],
    }));

    addAuditLog(
      'SANGRIA_EFECTIVO',
      `[Cash Drop / Sangría] Retiro de $${amount.toLocaleString('es-CL')} CLP desde gaveta hacia ${destination}. Efectivo antes: $${cashBefore.toLocaleString('es-CL')}, después: $${cashAfter.toLocaleString('es-CL')}. Folio: ${voucherFolio}. Motivo: ${reason}`,
      'warning',
      supervisorName || 'Supervisor'
    );

    persistToFirestore(COLLECTIONS.CASH_MOVEMENTS, newMovement.id, newMovement);
    cordanoOfflineDB.saveShift({
      ...currentShift,
      cashMovements: [...(currentShift.cashMovements || []), newMovement],
    }).catch(console.warn);

    return newMovement;
  };

  const registerCashMovement = (
    type: 'INGRESO_MANUAL' | 'RETIRO_SANGRIA' | 'GASTO_MENOR',
    amount: number,
    reason: string,
    supervisorPin?: string,
    requesterName?: string,
    authorizerName?: string
  ): CashMovement => {
    if (amount <= 0) {
      throw new Error('El monto del movimiento debe ser superior a $0 CLP');
    }

    if (!currentShift || currentShift.status !== 'abierto') {
      throw new Error('Caja Bloqueada: No se pueden registrar movimientos de efectivo sin un turno activo.');
    }

    if (currentShift.operatorId && user.id !== currentShift.operatorId && user.name !== currentShift.operatorName) {
      throw new Error(`Acceso Restringido: Solo el titular del turno (${currentShift.operatorName}) puede registrar movimientos de efectivo en gaveta.`);
    }

    const availableCash = getCurrentCashInDrawer();
    if ((type === 'RETIRO_SANGRIA' || type === 'GASTO_MENOR') && amount > availableCash) {
      throw new Error(
        `Fondos Insuficientes en Gaveta: El egreso solicitado ($${amount.toLocaleString('es-CL')} CLP) supera el efectivo disponible en caja ($${availableCash.toLocaleString('es-CL')} CLP).`
      );
    }

    const cashBefore = availableCash;
    const cashAfter = type === 'INGRESO_MANUAL' ? cashBefore + amount : cashBefore - amount;
    const isSangria = type === 'RETIRO_SANGRIA';

    const newMovement: CashMovement = {
      id: `mov-${Date.now()}`,
      shiftId: currentShift.id,
      timestamp: new Date().toISOString(),
      type,
      amount,
      reason,
      operatorId: user.id,
      operatorName: user.name,
      requesterName: requesterName || user.name,
      authorizerName: authorizerName || (supervisorPin ? 'Supervisor' : undefined),
      authorizedBySupervisor: supervisorPin ? `Supervisor (PIN ${supervisorPin})` : undefined,
      supervisorTotpPin: supervisorPin,
      voucherFolio: isSangria ? `SANG-${Math.floor(10000 + Math.random() * 90000)}` : `VOUCHER-${Math.floor(1000 + Math.random() * 9000)}`,
      destination: isSangria ? 'Administración Central / Bóveda Cordano' : undefined,
      cashInDrawerBefore: cashBefore,
      cashInDrawerAfter: cashAfter,
      isCashDrop: isSangria,
    };

    setCurrentShift((prev) => ({
      ...prev,
      cashMovements: [...(prev.cashMovements || []), newMovement],
    }));

    const typeLabel =
      type === 'INGRESO_MANUAL' ? 'INGRESO' : type === 'GASTO_MENOR' ? 'GASTO MENOR' : 'SANGRÍA/RETIRO';

    addAuditLog(
      isSangria ? 'SANGRIA_EFECTIVO' : (type === 'INGRESO_MANUAL' ? 'MOVIMIENTO_CAJA_INGRESO' : 'MOVIMIENTO_CAJA_RETIRO'),
      `Movimiento manual [${typeLabel}] por $${amount.toLocaleString('es-CL')} CLP. Solicitó: ${requesterName || user.name}. Motivo: ${reason}`,
      type === 'RETIRO_SANGRIA' || type === 'GASTO_MENOR' ? 'warning' : 'info',
      authorizerName || (supervisorPin ? 'Supervisor' : user.name)
    );

    persistToFirestore(COLLECTIONS.CASH_MOVEMENTS, newMovement.id, newMovement);

    return newMovement;
  };

  const registerVehicleEscape = (ticketId: string, notes: string, supervisorPin: string): boolean => {
    if (supervisorPin !== 'admin123' && supervisorPin !== '1234' && supervisorPin !== '2026') {
      throw new Error('PIN de supervisor incorrecto para registrar fuga');
    }

    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return false;

    const exitIso = new Date().toISOString();
    const stay = calculateFee(ticket, new Date(exitIso));

    const updatedTicket: Ticket = {
      ...ticket,
      exitTime: exitIso,
      durationMinutes: stay.durationMinutes,
      status: 'anulado',
      notes: `[FUGA REGISTRADA]: ${notes || 'Salida sin pago forzada'}. Monto no percibido: $${stay.totalAmount.toLocaleString('es-CL')} CLP`,
      operatorExitName: user.name,
    };

    setTickets((prev) => prev.map((t) => (t.id === ticketId ? updatedTicket : t)));
    persistToFirestore(COLLECTIONS.TICKETS, updatedTicket.id, updatedTicket);

    // Free slot if occupied by this ticket
    if (ticket.slotCode && ticket.slotCode !== 'SIN_ASIGNAR') {
      const slotRelease = {
        code: ticket.slotCode,
        status: 'disponible' as SlotStatus,
        currentTicketId: null,
        occupiedSince: null,
        plateNumber: null,
      };
      setSlots((prev) =>
        prev.map((s) =>
          s.code === ticket.slotCode || s.currentTicketId === ticketId
            ? { ...s, ...slotRelease, currentTicketId: undefined, occupiedSince: undefined, plateNumber: undefined }
            : s
        )
      );
      persistToFirestore(COLLECTIONS.SLOTS, ticket.slotCode, slotRelease);
    }

    addAuditLog(
      'SOBREESCRITURA_SALIDA',
      `ALERTA CRÍTICA: Fuga de vehículo reportada para patente ${ticket.plateNumber} (Slot ${ticket.slotCode}). Monto no recaudado: $${stay.totalAmount.toLocaleString('es-CL')} CLP. Observación: ${notes}`,
      'critical',
      `Supervisor (PIN ${supervisorPin})`
    );

    return true;
  };

  const performBlindClose = (
    declaredCash: number,
    declaredCard: number,
    declaredTransfer: number,
    justification?: string,
    breakdown?: ChileanCashBreakdown,
    supervisorPin?: string,
    handoverInfo?: { transferredVehiclesCount: number; forcedExitVehiclesCount: number },
    supervisorName?: string
  ): Shift => {
    if (!currentShift || currentShift.status !== 'abierto') {
      throw new Error('El turno ya se encuentra cerrado y sellado con SHA-256 de forma inmutable, o no existe turno abierto para cerrar.');
    }

    if (user.role !== 'operador') {
      throw new Error('Incompatibilidad de Caja: Administradores y Supervisores tienen estrictamente VEDADO realizar el arqueo de caja. El cierre ciego debe ser ejecutado por el operador titular.');
    }

    if (currentShift.operatorId && user.id !== currentShift.operatorId && user.name !== currentShift.operatorName) {
      throw new Error(`Acceso Restringido: Solo el titular del turno (${currentShift.operatorName}) puede realizar el arqueo y cierre.`);
    }

    // Calculate expected totals from paid tickets in current shift (accounting for mixed splits)
    const paidTickets = tickets.filter((t) => t.status === 'pagado');
    let cashTickets = 0;
    let expectedCard = 0;
    let expectedTransfer = 0;

    paidTickets.forEach((t) => {
      if (t.paymentSplits && t.paymentSplits.length > 0) {
        t.paymentSplits.forEach((split) => {
          if (split.method === 'efectivo') {
            cashTickets += split.amount;
          } else if (split.method === 'tarjeta_debito' || split.method === 'tarjeta_credito') {
            expectedCard += split.amount;
          } else if (split.method === 'transferencia') {
            expectedTransfer += split.amount;
          }
        });
      } else {
        if (t.paymentMethod === 'efectivo') {
          cashTickets += (t.totalAmount || 0);
        } else if (t.paymentMethod === 'tarjeta_debito' || t.paymentMethod === 'tarjeta_credito') {
          expectedCard += (t.totalAmount || 0);
        } else if (t.paymentMethod === 'transferencia') {
          expectedTransfer += (t.totalAmount || 0);
        }
      }
    });

    // Sum manual cash movements
    const movements = currentShift.cashMovements || [];
    const manualIngresos = movements
      .filter((m) => m.type === 'INGRESO_MANUAL')
      .reduce((sum, m) => sum + m.amount, 0);
    const manualSangrias = movements
      .filter((m) => m.type === 'RETIRO_SANGRIA' || m.type === 'GASTO_MENOR')
      .reduce((sum, m) => sum + m.amount, 0);

    // Cash physically expected in drawer: discounts cash drops/sangrias without altering total revenue
    const expectedCash = (currentShift.initialCash || 0) + cashTickets + manualIngresos - manualSangrias;

    const discrepancyCash = declaredCash - expectedCash;
    const totalDeclared = declaredCash + declaredCard + declaredTransfer;
    const totalExpected = expectedCash + expectedCard + expectedTransfer;
    const discrepancyTotal = totalDeclared - totalExpected;
    const isDiscrepancyFlagged = Math.abs(discrepancyCash) > cashToleranceClp;

    // Generación de Resumen de Ventas Diarias (RVD) legal para el SII
    const rvd = generateDailySalesReportRVD(currentShift, paidTickets);
    setDailyRvd(rvd);

    const closeTimestamp = new Date().toISOString();

    // Sello Criptográfico Inmutable SHA-256 oficial
    const seal = generateShiftCryptographicSeal({
      id: currentShift.id,
      startTime: currentShift.startTime,
      endTime: closeTimestamp,
      operatorId: user.id,
      operatorName: user.name,
      declaredCash,
      declaredCard,
      declaredTransfer,
      expectedCash,
      expectedCard,
      expectedTransfer,
      discrepancyTotal,
      rvdFolio: rvd.folioRvd,
      supervisorPin,
    });
    const auditHash = seal.formattedSeal;

    const closedShift: Shift = {
      ...currentShift,
      endTime: closeTimestamp,
      declaredCash,
      declaredCard,
      declaredTransfer,
      declaredCashBreakdown: breakdown,
      expectedCash,
      expectedCard,
      expectedTransfer,
      discrepancyCash,
      discrepancyTotal,
      isDiscrepancyFlagged,
      closeJustification: justification,
      authorizedBySupervisorPin: supervisorPin,
      supervisorName: supervisorName || (supervisorPin ? 'Supervisor Autorizante' : undefined),
      transferredVehiclesCount: handoverInfo?.transferredVehiclesCount ?? 0,
      forcedExitVehiclesCount: handoverInfo?.forcedExitVehiclesCount ?? 0,
      status: 'cerrado',
      totalTicketsProcessed: paidTickets.length,
      signedCopy1Caja: true,
      signedCopy2Operador: false,
      offlineSyncStatus: isOffline ? 'pending_sync' : 'synced',
      hashAuditoria: auditHash,
      hash: auditHash,
      rvdStatus: 'emitido',
      rvdFolio: rvd.folioRvd,
      rvdSummaryXml: rvd.xmlRvd,
    };

    setCurrentShift(closedShift);
    cordanoOfflineDB.saveShift(closedShift).catch(console.warn);

    // Persist in local storage history array
    try {
      const historyRaw = localStorage.getItem('pms_matic_shift_history');
      const historyList: Shift[] = historyRaw ? JSON.parse(historyRaw) : [];
      const updatedHistory = [closedShift, ...historyList.filter((s) => s.id !== closedShift.id)];
      localStorage.setItem('pms_matic_shift_history', JSON.stringify(updatedHistory));

      if (isOffline) {
        const offlineRaw = localStorage.getItem('pms_matic_offline_shifts');
        const offlineList = offlineRaw ? JSON.parse(offlineRaw) : [];
        offlineList.push(closedShift);
        localStorage.setItem('pms_matic_offline_shifts', JSON.stringify(offlineList));
      }
    } catch (e) {
      console.error('Error saving shift history:', e);
    }

    persistToFirestore(COLLECTIONS.SHIFTS, closedShift.id, closedShift);

    addAuditLog(
      'CIERRE_CAJA_CIEGO',
      `Cierre de caja ciego procesado por ${user.name}. Declarado: $${totalDeclared.toLocaleString('es-CL')} | Esperado: $${totalExpected.toLocaleString('es-CL')} (Diferencia: $${discrepancyTotal.toLocaleString('es-CL')} CLP). RVD Folio: ${rvd.folioRvd}${isDiscrepancyFlagged ? ' [DESCUADRADO > $2.000 CLP]' : ''}${justification ? ` - Justificación: ${justification}` : ''}`,
      isDiscrepancyFlagged ? 'critical' : discrepancyTotal !== 0 ? 'warning' : 'info',
      supervisorPin ? `Supervisor (${supervisorName || 'PIN Verificado'})` : undefined
    );

    return closedShift;
  };

  const signShiftCopy = (copyType: 'caja' | 'operador') => {
    setCurrentShift((prev) => {
      const updated: Shift = {
        ...prev,
        signedCopy1Caja: copyType === 'caja' ? true : prev.signedCopy1Caja,
        signedCopy2Operador: copyType === 'operador' ? true : prev.signedCopy2Operador,
      };
      persistToFirestore(COLLECTIONS.SHIFTS, updated.id, updated);
      return updated;
    });

    addAuditLog(
      'CIERRE_CAJA_CIEGO',
      `Acta de entrega de turno firmada digitalmente: ${copyType === 'caja' ? 'Copia 1 (Caja Recinto)' : 'Copia 2 (Respaldo Operador)'} por ${user.name}`,
      'info'
    );
  };

  const openNewShift = (initialCash: number = 50000, breakdown?: ChileanCashBreakdown) => {
    // Incompatibilidad de Caja: Administradores y Supervisores tienen VEDADA la apertura de turnos
    if (user.role !== 'operador') {
      throw new Error('Incompatibilidad de Caja: Administradores y Supervisores tienen estrictamente VEDADA la apertura de turnos. Solo usuarios con rol Operador pueden aperturar caja en garita.');
    }

    const validatedInitialCash = initialCash > 0 ? initialCash : 50000;
    const newShift: Shift = {
      id: `SHIFT-${Math.floor(1000 + Math.random() * 9000)}`,
      operatorId: user.id,
      operatorName: user.name,
      startTime: new Date().toISOString(),
      initialCash: validatedInitialCash,
      initialCashBreakdown: breakdown,
      cashMovements: [],
      status: 'abierto',
      totalTicketsProcessed: 0,
      signedCopy1Caja: false,
      signedCopy2Operador: false,
      isDiscrepancyFlagged: false,
      offlineSyncStatus: isOffline ? 'pending_sync' : 'synced',
    };

    setCurrentShift(newShift);
    persistToFirestore(COLLECTIONS.SHIFTS, newShift.id, newShift);
    cordanoOfflineDB.saveShift(newShift).catch(console.warn);

    addAuditLog(
      'APERTURA_TURNO',
      `Nuevo turno iniciado (${newShift.id}) por ${user.name} con fondo inicial de $ ${validatedInitialCash.toLocaleString('es-CL')} CLP`
    );
  };

  // Hardware thermal printing
  const printEntryTicket = async (ticket: Ticket): Promise<boolean> => {
    try {
      const bytes = EscPosDriver.buildEntryTicketBytes(ticket);
      return await EscPosDriver.printViaWebSerial(bytes);
    } catch {
      return false;
    }
  };

  const printFiscalReceipt = async (ticket: Ticket): Promise<boolean> => {
    try {
      const fiscalDoc = emitFiscalDte(ticket, ticket.dteType || tariffConfig.taxDocumentType);
      const bytes = EscPosDriver.buildFiscalReceiptBytes(fiscalDoc);
      return await EscPosDriver.printViaWebSerial(bytes);
    } catch {
      return false;
    }
  };

  const generateRvdReport = (): DailySalesReportRVD => {
    const paidTickets = tickets.filter((t) => t.status === 'pagado');
    const report = generateDailySalesReportRVD(currentShift, paidTickets);
    setDailyRvd(report);
    return report;
  };

  return (
    <ParkingContext.Provider
      value={{
        user,
        setUser,
        setUserRole,
        hasPermission,
        isLoggedIn,
        setIsLoggedIn,
        logout,
        firebaseUser,
        loginWithFirebase,
        activeTab,
        setActiveTab,
        slots,
        tickets,
        customers,
        currentShift,
        isShiftOpen,
        isShiftOwner,
        isViewerOnly,
        tariffConfig,
        tariffVersions,
        activeTariffVersion,
        auditLogs,
        isOffline,
        setIsOffline,
        isFirebaseConnected,
        syncQueueCount,
        pendingApprovals,
        addPendingApproval,
        resolvePendingApproval,
        cashToleranceClp,
        keyboardShortcutsEnabled,
        setKeyboardShortcutsEnabled,
        checklistTasks,
        isChecklistModalOpen,
        setIsChecklistModalOpen,
        toggleChecklistTask,
        completeChecklist,
        snoozeChecklist,
        checklistSnoozeRemainingSeconds,
        saveCustomer,
        findCustomerByPlate,
        agreements,
        findAgreementByPlate,
        renewAgreement,
        createAgreement,
        updateAgreement,
        deleteAgreement,
        registerEntry,
        validateAntiPassback,
        assignSlotToTicket,
        moveOrSwapVehicleSlot,
        calculateFee,
        processPayment,
        cancelTicket,
        updateSlotStatus,
        updateTariffConfig,
        currentCashInDrawer,
        getCurrentCashInDrawer,
        registerCashDrop,
        registerCashMovement,
        registerVehicleEscape,
        performBlindClose,
        addAuditLog,
        openNewShift,
        signShiftCopy,
        printEntryTicket,
        printFiscalReceipt,
        dailyRvd,
        generateRvdReport,
      }}
    >
      {children}
    </ParkingContext.Provider>
  );
};

export const useParking = () => {
  const context = useContext(ParkingContext);
  if (!context) {
    throw new Error('useParking must be used within a ParkingProvider');
  }
  return context;
};
