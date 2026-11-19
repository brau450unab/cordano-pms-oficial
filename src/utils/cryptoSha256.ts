/**
 * CORDANO PMS — Motor Criptográfico SHA-256 Inmutable
 * Cumplimiento de Reglas de Auditoría, Ley 20.967 y Sellado de Arqueos Ciegos.
 *
 * Implementa cálculo criptográfico SHA-256 estándar FIPS 180-4 puro sin dependencias externas,
 * garantizando compatibilidad síncrona/asíncrona en cualquier entorno.
 */

// Funciones bitwise estándar para SHA-256
function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

export function sha256Sync(ascii: string): string {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  // Constantes iniciales de hash (primeros 32 bits de las partes fraccionarias de las raíces cuadradas de los primeros 8 primos 2..19)
  let hash: number[] = [];
  // Constantes de ronda K (primeros 32 bits de las partes fraccionarias de las raíces cúbicas de los primeros 64 primos 2..311)
  const k: number[] = [];

  let primeCounter = 0;
  const isPrime = (n: number) => {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % factor === 0) return false;
    }
    return true;
  };

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  // Pre-procesamiento / Padding
  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  // Proceso por bloques de 512 bits (16 palabras de 32 bits)
  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 = i < 16 ? w[i] : (w[i] = (
        (w[i - 16] +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          w[i - 7] +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0
      ));

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        s0;
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [
        (temp1 + temp2) | 0,
        a,
        hash[1],
        hash[2],
        (hash[3] + temp1) | 0,
        hash[4],
        hash[5],
        hash[6],
      ];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result.toLowerCase();
}

/**
 * Calcula el SHA-256 de forma asíncrona usando Web Crypto API cuando esté disponible,
 * con fallback síncrono ultra-robusto.
 */
export async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const msgUint8 = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
    } catch {
      return sha256Sync(text);
    }
  }
  return sha256Sync(text);
}

export interface ShiftSealResult {
  hashHex: string;
  formattedSeal: string;
  canonicalPayload: string;
  timestamp: string;
}

/**
 * Genera el Sello Criptográfico Inmutable SHA-256 oficial para el Arqueo Ciego de Cierre de Turno.
 * Estampa de forma indeleble los valores de recaudación, diferencias y titularidad.
 */
export function generateShiftCryptographicSeal(shift: {
  id: string;
  startTime: string;
  endTime?: string;
  operatorId: string;
  operatorName: string;
  declaredCash: number;
  declaredCard: number;
  declaredTransfer: number;
  expectedCash: number;
  expectedCard: number;
  expectedTransfer: number;
  discrepancyTotal: number;
  rvdFolio?: string;
  supervisorPin?: string;
}): ShiftSealResult {
  const timestamp = shift.endTime || new Date().toISOString();
  
  // Payload canónico ordenado determinístico
  const canonicalPayload = JSON.stringify({
    system: 'CORDANO_PMS_SERRANO_447_IQUIQUE',
    shiftId: shift.id,
    startTime: shift.startTime,
    endTime: timestamp,
    operatorId: shift.operatorId,
    operatorName: shift.operatorName,
    declaredCash: shift.declaredCash,
    declaredCard: shift.declaredCard,
    declaredTransfer: shift.declaredTransfer,
    expectedCash: shift.expectedCash,
    expectedCard: shift.expectedCard,
    expectedTransfer: shift.expectedTransfer,
    discrepancyTotal: shift.discrepancyTotal,
    rvdFolio: shift.rvdFolio || 'PENDING_RVD',
    authorizedBySupervisor: Boolean(shift.supervisorPin),
    salt: 'CORDANO_PMS_CHILE_LEY20967_INMUTABLE_AUDIT_2026',
  });

  const hashHex = sha256Sync(canonicalPayload);
  const formattedSeal = `SHA256:${hashHex.slice(0, 16).toUpperCase()}-${hashHex.slice(16, 32).toUpperCase()}-${hashHex.slice(32, 48).toUpperCase()}-${hashHex.slice(48, 64).toUpperCase()}`;

  return {
    hashHex,
    formattedSeal,
    canonicalPayload,
    timestamp,
  };
}
