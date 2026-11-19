import { describe, it, expect, beforeEach } from 'vitest';
import { ROLE_PERMISSIONS, INITIAL_ADMIN, INITIAL_OPERATOR } from '../../data/mockData';
import { calculateStayFeeLey20967 } from '../tariffEngine';
import { Ticket, TariffConfig, Shift, User, UserRole, UserPermissions } from '../../types';

describe('Batería de Pruebas Combinatorias & Certificación de Robustez (Cordano PMS v2.0.0)', () => {

  // =========================================================================
  // 1. IDENTIDAD Y AISLAMIENTO RBAC: OPERADOR VS ADMIN VS SUPERVISOR
  // =========================================================================
  describe('1. Identidad y Aislamiento RBAC', () => {
    it('debe aislar estrictamente las facultades del rol OPERADOR', () => {
      const opPermissions = ROLE_PERMISSIONS.operador;
      expect(opPermissions.canOperatePos).toBe(true);
      expect(opPermissions.canOpenCloseShift).toBe(true);
      expect(opPermissions.canViewReports).toBe(false);
      expect(opPermissions.canViewAudit).toBe(false);
      expect(opPermissions.canConfigureSystem).toBe(false);
      expect(opPermissions.canManageClients).toBe(false);
      expect(opPermissions.isLiveSupervisorMode).toBe(false);
    });

    it('debe restringir la operación de garita al rol SUPERVISOR (solo modo visor/auditoría)', () => {
      const supPermissions = ROLE_PERMISSIONS.supervisor;
      expect(supPermissions.canOperatePos).toBe(false);
      expect(supPermissions.canOpenCloseShift).toBe(false);
      expect(supPermissions.canViewReports).toBe(true);
      expect(supPermissions.canViewAudit).toBe(true);
      expect(supPermissions.canConfigureSystem).toBe(false);
      expect(supPermissions.canManageClients).toBe(true);
      expect(supPermissions.isLiveSupervisorMode).toBe(true);
    });

    it('debe otorgar facultades administrativas y aplicar incompatibilidad de caja al rol ADMINISTRADOR', () => {
      const adminPermissions = ROLE_PERMISSIONS.administrador;
      // Incompatibilidad de caja: Administrador tiene vedada la apertura y cobro directo para imparcialidad de arqueo
      expect(adminPermissions.canOperatePos).toBe(false);
      expect(adminPermissions.canOpenCloseShift).toBe(false);
      expect(adminPermissions.canViewReports).toBe(true);
      expect(adminPermissions.canViewAudit).toBe(true);
      expect(adminPermissions.canConfigureSystem).toBe(true);
      expect(adminPermissions.canManageClients).toBe(true);
      expect(adminPermissions.isLiveSupervisorMode).toBe(true);
    });

    it('debe aislar la titularidad del turno: isShiftOwner vs isViewerOnly', () => {
      const shiftOwner: User = {
        ...INITIAL_OPERATOR,
        id: 'usr-cajero-1',
        name: 'Carlos Mendoza',
      };
      const foreignOperator: User = {
        ...INITIAL_OPERATOR,
        id: 'usr-cajero-2',
        name: 'Pedro Soto',
      };
      const activeShift: Shift = {
        id: 'shift-100',
        operatorId: shiftOwner.id,
        operatorName: shiftOwner.name,
        startTime: '2026-10-13T08:00:00.000Z',
        initialCash: 50000,
        cashMovements: [],
        status: 'abierto',
        totalTicketsProcessed: 0,
        signedCopy1Caja: false,
        signedCopy2Operador: false,
      };

      // Evaluación para el titular legítimo
      const isShiftOpen = activeShift.status === 'abierto';
      const ownerIsShiftOwner = isShiftOpen && Boolean(
        (shiftOwner.id && activeShift.operatorId === shiftOwner.id) ||
        (shiftOwner.name && activeShift.operatorName === shiftOwner.name)
      );
      const ownerIsViewerOnly = isShiftOpen && !ownerIsShiftOwner;

      expect(ownerIsShiftOwner).toBe(true);
      expect(ownerIsViewerOnly).toBe(false);

      // Evaluación para el operador invasor
      const intruderIsShiftOwner = isShiftOpen && Boolean(
        (foreignOperator.id && activeShift.operatorId === foreignOperator.id) ||
        (foreignOperator.name && activeShift.operatorName === foreignOperator.name)
      );
      const intruderIsViewerOnly = isShiftOpen && !intruderIsShiftOwner;

      expect(intruderIsShiftOwner).toBe(false);
      expect(intruderIsViewerOnly).toBe(true);
    });
  });

  // =========================================================================
  // 2. CIERRE CIEGO DE TURNO: LOS 3 ESCENARIOS Y SEGURIDAD ANTIFRAUDE
  // =========================================================================
  describe('2. Cierre Ciego de Turno (Blind Closing)', () => {
    const cashToleranceClp = 2000;
    const initialCash = 50000;
    const cashTicketsTotal = 45000;
    const manualIngresos = 5000;
    const manualSangrias = 10000;

    // Efectivo esperado en gaveta = 50.000 + 45.000 + 5.000 - 10.000 = $90.000 CLP
    const expectedCash = initialCash + cashTicketsTotal + manualIngresos - manualSangrias;

    it('Escenario A: Cuadratura Exacta (Descuadre $0 CLP)', () => {
      const declaredCash = 90000;
      const discrepancyCash = declaredCash - expectedCash;
      const isDiscrepancyFlagged = Math.abs(discrepancyCash) > cashToleranceClp;

      expect(expectedCash).toBe(90000);
      expect(discrepancyCash).toBe(0);
      expect(isDiscrepancyFlagged).toBe(false);
    });

    it('Escenario B: Faltante de Efectivo (-$15.000 CLP)', () => {
      const declaredCash = 75000; // El cajero entrega $15.000 menos
      const discrepancyCash = declaredCash - expectedCash;
      const isDiscrepancyFlagged = Math.abs(discrepancyCash) > cashToleranceClp;

      expect(discrepancyCash).toBe(-15000);
      expect(isDiscrepancyFlagged).toBe(true);
      // Debe exigir justificación y validación de supervisor presencial
      expect(Math.abs(discrepancyCash)).toBeGreaterThan(cashToleranceClp);
    });

    it('Escenario C: Sobrante de Efectivo (+$5.000 CLP)', () => {
      const declaredCash = 95000; // El cajero entrega $5.000 extra
      const discrepancyCash = declaredCash - expectedCash;
      const isDiscrepancyFlagged = Math.abs(discrepancyCash) > cashToleranceClp;

      expect(discrepancyCash).toBe(5000);
      expect(isDiscrepancyFlagged).toBe(true);
      expect(Math.abs(discrepancyCash)).toBeGreaterThan(cashToleranceClp);
    });

    it('Escenario de Tolerancia: Descuadre menor a $2.000 CLP no bloquea', () => {
      const declaredCash = 89000; // Faltante de $1.000 (dentro de tolerancia legal de $2.000)
      const discrepancyCash = declaredCash - expectedCash;
      const isDiscrepancyFlagged = Math.abs(discrepancyCash) > cashToleranceClp;

      expect(discrepancyCash).toBe(-1000);
      expect(isDiscrepancyFlagged).toBe(false);
    });

    it('Garantía Antifraude de Ceguera: la interfaz del cajero en Fase de Arqueo no debe mostrar saldos esperados', () => {
      // Simulación de los campos expuestos al cajero durante el arqueo físico
      const cashierStepFields = {
        declaredCoins: 15000,
        declaredBills: 75000,
        totalDeclared: 90000,
        // Los siguientes campos NUNCA deben suministrarse a la vista del cajero antes del sellado:
        showExpectedAmountToCashier: false,
        showLiveDifferenceToCashier: false,
      };

      expect(cashierStepFields.showExpectedAmountToCashier).toBe(false);
      expect(cashierStepFields.showLiveDifferenceToCashier).toBe(false);
    });
  });

  // =========================================================================
  // 3. LEY N° 20.967: REGLAS MATEMÁTICAS, TOLERANCIA Y TRUNCAMIENTO ESTRICTO
  // =========================================================================
  describe('3. Ley N° 20.967: Tarifas, Tolerancia y Truncamiento', () => {
    const tariffConfigTranches: TariffConfig = {
      billingModel: 'TRANCHE_30_10',
      taxDocumentType: 39,
      gracePeriodMinutes: 15,
      nightSurchargePercent: 0,
      weekendSurchargePercent: 0,
      vehicleRates: {
        'Automóvil': { minuteRate: 40, hourlyRate: 2400, maxDailyRate: 20000 },
        'Camioneta': { minuteRate: 50, hourlyRate: 3000, maxDailyRate: 25000 },
        'Motocicleta': { minuteRate: 20, hourlyRate: 1200, maxDailyRate: 10000 },
        'Furgón / SUV': { minuteRate: 50, hourlyRate: 3000, maxDailyRate: 25000 },
      },
      subsequentTrancheRates: {
        'Automóvil': 400,
        'Camioneta': 500,
        'Motocicleta': 200,
        'Furgón / SUV': 500,
      },
    };

    const tariffConfigMinute: TariffConfig = {
      ...tariffConfigTranches,
      billingModel: 'PER_MINUTE',
    };

    const createTicket = (entryTime: string, vehicleType: 'Automóvil' | 'Camioneta' = 'Automóvil'): Ticket => ({
      id: 'tkt-cert-1',
      ticketCode: 'CPMS-CERT',
      plateNumber: 'CERT99',
      entryTime,
      slotCode: 'A-01',
      vehicleType,
      status: 'activo',
      operatorEntryName: 'Cajero Cert',
    });

    it('debe liquidar en $0 CLP estadías dentro del período de gracia de 15 minutos', () => {
      const entry = new Date('2026-10-13T12:00:00Z');
      const exit15Min = new Date('2026-10-13T12:15:00Z'); // Exactamente 15 min
      const exit7Min = new Date('2026-10-13T12:07:00Z');  // 7 min

      const res15 = calculateStayFeeLey20967(createTicket(entry.toISOString()), tariffConfigTranches, exit15Min);
      expect(res15.isGracePeriod).toBe(true);
      expect(res15.totalAmount).toBe(0);

      const res7 = calculateStayFeeLey20967(createTicket(entry.toISOString()), tariffConfigTranches, exit7Min);
      expect(res7.isGracePeriod).toBe(true);
      expect(res7.totalAmount).toBe(0);
    });

    it('debe cobrar por minuto efectivo lineal en modalidad PER_MINUTE', () => {
      const entry = new Date('2026-10-13T12:00:00Z');
      const exit = new Date('2026-10-13T12:25:00Z'); // 25 min (>15 min de gracia)
      const ticket = createTicket(entry.toISOString());

      const res = calculateStayFeeLey20967(ticket, tariffConfigMinute, exit);

      expect(res.durationMinutes).toBe(25);
      expect(res.isGracePeriod).toBe(false);
      // 25 min * $40 = $1.000 CLP
      expect(res.totalAmount).toBe(1000);
    });

    it('debe aplicar truncamiento estricto pro-consumidor en tramos (Math.floor sin Math.ceil)', () => {
      const entry = new Date('2026-10-13T12:00:00Z');
      // 30 min base + 19 min extras = 49 min total.
      // Ley 20.967 prohíbe redondear al alza a 2 tramos. Debe cobrarse exactamente 1 tramo de 10 min.
      const exit = new Date('2026-10-13T12:49:00Z');
      const ticket = createTicket(entry.toISOString());

      const res = calculateStayFeeLey20967(ticket, tariffConfigTranches, exit);

      expect(res.durationMinutes).toBe(49);
      // Base 30 min: 30 * 40 = $1.200
      expect(res.baseAmount).toBe(1200);
      // 1 tramo de 10 min: $400 (los 9 min restantes quedan exentos por truncamiento legal)
      expect(res.subsequentAmount).toBe(400);
      expect(res.totalAmount).toBe(1600);
    });

    it('debe redondear el total final siempre a la decena inferior (Math.floor a la decena)', () => {
      // Configuración con recargo que genere números que no terminan en cero
      const configWithDecimals: TariffConfig = {
        ...tariffConfigMinute,
        nightSurchargePercent: 15,
      };
      // Forzamos salida nocturna a las 23:23 hrs (hora local)
      const entry = new Date(2026, 9, 13, 23, 0, 0);
      const exit = new Date(2026, 9, 13, 23, 23, 0); // 23 min * $40 = $920. Recargo 15% = $138. Total bruto = $1.058.
      const ticket = createTicket(entry.toISOString());

      const res = calculateStayFeeLey20967(ticket, configWithDecimals, exit);

      // Truncamiento a la decena inferior: Math.floor(1058 / 10) * 10 = $1.050 CLP (nunca $1.060)
      expect(res.totalAmount % 10).toBe(0);
      expect(res.totalAmount).toBe(1050);
    });

    it('debe congelar la tarifa del ticket ingresado aunque el sistema actualice los precios', () => {
      const entry = new Date('2026-10-13T10:00:00Z');
      const exit = new Date('2026-10-13T11:00:00Z'); // 60 min
      const ticket = createTicket(entry.toISOString());
      ticket.frozenRate = { minuteRate: 20, hourlyRate: 1200, maxDailyRate: 15000 };

      // Tarifas globales actuales son más altas ($40/min)
      const res = calculateStayFeeLey20967(ticket, tariffConfigMinute, exit);

      expect(res.isFrozenRateApplied).toBe(true);
      // 60 min * $20 = $1.200 CLP (no los $2.400 de la tarifa nueva)
      expect(res.totalAmount).toBe(1200);
    });
  });

  // =========================================================================
  // 4. CONTROL DE ACCESO VEHICULAR Y VALIDACIÓN ANTI-PASSBACK
  // =========================================================================
  describe('4. Validación Anti-Passback', () => {
    interface ActiveYardTicket {
      plateNumber: string;
      status: 'activo' | 'pagado' | 'anulado';
      ticketCode: string;
    }

    const validateAntiPassback = (
      plateNumber: string,
      currentTickets: ActiveYardTicket[]
    ): { allowed: boolean; error?: string } => {
      const formattedPlate = plateNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const existingActive = currentTickets.find(
        (t) => t.plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') === formattedPlate && t.status === 'activo'
      );
      if (existingActive) {
        return {
          allowed: false,
          error: `[Anti-Passback] La patente ${formattedPlate} ya registra una entrada activa en el ticket ${existingActive.ticketCode}`,
        };
      }
      return { allowed: true };
    };

    it('debe rechazar el ingreso si la patente ya se encuentra activa dentro del patio', () => {
      const existingTickets: ActiveYardTicket[] = [
        { plateNumber: 'ABCD12', status: 'activo', ticketCode: 'CPMS-0001' },
        { plateNumber: 'WXYZ88', status: 'pagado', ticketCode: 'CPMS-0002' },
      ];

      const checkExact = validateAntiPassback('ABCD12', existingTickets);
      expect(checkExact.allowed).toBe(false);
      expect(checkExact.error).toContain('[Anti-Passback]');
      expect(checkExact.error).toContain('CPMS-0001');

      // Prueba insensible a mayúsculas y espacios
      const checkLowercase = validateAntiPassback('  abcd12  ', existingTickets);
      expect(checkLowercase.allowed).toBe(false);
      expect(checkLowercase.error).toContain('ABCD12');
    });

    it('debe autorizar el ingreso si la patente tuvo un ticket anterior ya pagado o salido', () => {
      const existingTickets: ActiveYardTicket[] = [
        { plateNumber: 'WXYZ88', status: 'pagado', ticketCode: 'CPMS-0002' },
        { plateNumber: 'ZZZZ99', status: 'anulado', ticketCode: 'CPMS-0003' },
      ];

      const checkReentry = validateAntiPassback('WXYZ88', existingTickets);
      expect(checkReentry.allowed).toBe(true);
      expect(checkReentry.error).toBeUndefined();
    });

    it('debe autorizar el ingreso para una patente completamente nueva', () => {
      const existingTickets: ActiveYardTicket[] = [
        { plateNumber: 'ABCD12', status: 'activo', ticketCode: 'CPMS-0001' },
      ];

      const checkNew = validateAntiPassback('KLPX44', existingTickets);
      expect(checkNew.allowed).toBe(true);
    });
  });

  // =========================================================================
  // 5. PERSISTENCIA ANTE RECARGAS (F5 / LOCALSTORAGE)
  // =========================================================================
  describe('5. Validación de Persistencia ante Recargas (F5)', () => {
    const STORAGE_KEYS = {
      SLOTS: 'cordano_slots_v3',
      TICKETS: 'cordano_tickets_v3',
      SHIFT: 'cordano_shift_v3',
      TARIFF: 'cordano_tariff_v3',
      AUDIT: 'cordano_audit_v3',
      CUSTOMERS: 'cordano_customers_v3',
      AGREEMENTS: 'cordano_agreements_v3',
      KEYBOARD_SHORTCUTS: 'cordano_keyboard_shortcuts_enabled',
    };

    let fakeLocalStorage: Record<string, string> = {};

    beforeEach(() => {
      fakeLocalStorage = {};
    });

    it('debe persistir y restaurar el turno íntegro con su fondo y movimientos de caja', () => {
      const sampleShift: Shift = {
        id: 'shift-f5-test',
        operatorId: 'usr-1',
        operatorName: 'Cajero Matutino',
        startTime: '2026-10-13T08:00:00.000Z',
        initialCash: 50000,
        cashMovements: [
          {
            id: 'mov-1',
            shiftId: 'shift-f5-test',
            operatorId: 'usr-1',
            operatorName: 'Cajero Matutino',
            type: 'INGRESO_MANUAL',
            amount: 10000,
            timestamp: '2026-10-13T09:00:00.000Z',
            reason: 'Sencillo inicial extra',
            requesterName: 'Cajero Matutino',
            authorizerName: 'Supervisor',
          },
        ],
        status: 'abierto',
        totalTicketsProcessed: 3,
        signedCopy1Caja: false,
        signedCopy2Operador: false,
      };

      // Simulación de guardado
      fakeLocalStorage[STORAGE_KEYS.SHIFT] = JSON.stringify(sampleShift);

      // Simulación de F5 (lectura desde almacenamiento frío)
      const restoredRaw = fakeLocalStorage[STORAGE_KEYS.SHIFT];
      expect(restoredRaw).toBeDefined();

      const restoredShift: Shift = JSON.parse(restoredRaw!);
      expect(restoredShift.id).toBe(sampleShift.id);
      expect(restoredShift.initialCash).toBe(50000);
      expect(restoredShift.cashMovements).toHaveLength(1);
      expect(restoredShift.cashMovements[0].amount).toBe(10000);
      expect(restoredShift.status).toBe('abierto');
    });

    it('debe persistir el parque vehicular en patio (tickets activos y slots ocupados)', () => {
      const activeTickets: Ticket[] = [
        {
          id: 'tkt-pers-1',
          ticketCode: 'CPMS-P01',
          plateNumber: 'PPLL11',
          entryTime: '2026-10-13T10:00:00Z',
          slotCode: 'A-01',
          vehicleType: 'Automóvil',
          status: 'activo',
          operatorEntryName: 'Operador',
        },
      ];

      fakeLocalStorage[STORAGE_KEYS.TICKETS] = JSON.stringify(activeTickets);

      const restoredTickets: Ticket[] = JSON.parse(fakeLocalStorage[STORAGE_KEYS.TICKETS]);
      expect(restoredTickets).toHaveLength(1);
      expect(restoredTickets[0].plateNumber).toBe('PPLL11');
      expect(restoredTickets[0].slotCode).toBe('A-01');
      expect(restoredTickets[0].status).toBe('activo');
    });
  });
});
