/**
 * @file public-xolos-data-adapter.js
 * Contractual data adapter for public Xolos Ramírez information.
 *
 * Implements the Public Xolos Data Adapter abstraction frozen in XR-AC0 Revision B.
 * Serves as the authoritative source-of-truth for WebMCP tools and agent consumption.
 *
 * INVARIANTS:
 * - Strictly PUBLIC_READ_ONLY.
 * - Zero PII (no customer names, private phone numbers, physical kennel addresses, or buyer notes).
 * - Zero private pricing disclosure (getPriceProcessInformation explains ethical breeding philosophy
 *   and protocol without exposing numerical price tags).
 * - Deterministic outputs.
 */

export const CANONICAL_PUBLIC_BIRTH_DATES = {
  tlilxochitl: '2026-08-03' // Backed by public card in xolos-disponibles.html: "Recién nacida · 3 de agosto de 2026"
};

/**
 * Validates that a profile does not synthesize an exact birthDate when only
 * an approximate age (e.g. "1 mes", "recién nacido") is publicly published.
 * @param {Object} profile
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePublicAgeIntegrity(profile) {
  if (profile && profile.birthDate) {
    const canonicalDate = CANONICAL_PUBLIC_BIRTH_DATES[profile.id];
    if (!canonicalDate || canonicalDate !== profile.birthDate) {
      return {
        valid: false,
        error: `Profile "${profile.id}" specifies synthetic or unverified birthDate "${profile.birthDate}". Public approximate age must not be substituted with synthetic exact dates.`
      };
    }
  }
  return { valid: true };
}

export const CANONICAL_PUBLIC_XOLOS = [
  {
    id: 'tlilxochitl',
    name: 'Tlilxóchitl Ramirez',
    status: 'available',
    variety: 'hairless',
    size: 'intermediate',
    gender: 'female',
    color: 'black',
    birthDate: '2026-08-03',
    ageDescription: 'Recién nacida · 3 de agosto de 2026',
    personalitySummary: 'Cachorra xoloitzcuintle con copete característico, vivaz, atenta y de temperamento equilibrado con fuerte apego familiar.',
    careConsiderations: [
      'Protección solar e hidratación cutánea periódica',
      'Temperatura templada en interiores',
      'Sociabilización temprana continua'
    ],
    lineageReference: 'Linaje ancestral Xolos Ramírez con registro genealógico FCM / FCI',
    publicUrl: 'https://xolosramirez.com/xolos-disponibles.html#tlilxochitl'
  },
  {
    id: 'xilonen',
    name: 'Xilonen Ramirez',
    status: 'available',
    variety: 'hairless',
    size: 'miniature',
    gender: 'female',
    color: 'black',
    ageDescription: 'Cachorra miniatura de 1 mes',
    personalitySummary: 'Cachorra xoloitzcuintle miniatura sin pelo, dulce, observadora, excelente para vida en departamento o compañía cercana.',
    careConsiderations: [
      'Cuidado dérmico suave libre de fragancias sintéticas',
      'Ropa térmica ligera para temporadas frías',
      'Alimentación balanceada de alta digestibilidad'
    ],
    lineageReference: 'Linaje ancestral Xolos Ramírez con pedigree internacional',
    publicUrl: 'https://xolosramirez.com/xolos-disponibles.html#xilonen'
  },
  {
    id: 'oce',
    name: 'Oce Ramirez',
    status: 'reserved',
    variety: 'hairless',
    size: 'intermediate',
    gender: 'male',
    color: 'black',
    ageDescription: 'Cachorro macho recién nacido (reservado)',
    personalitySummary: 'Cachorro curioso, juguetón y de gran afinidad con niños y otros caninos.',
    careConsiderations: [
      'Cuidado preventivo de piel y exfoliación natural mensual'
    ],
    lineageReference: 'Linaje Tonalli Xolos Ramírez',
    publicUrl: 'https://xolosramirez.com/xolos-disponibles.html#oce'
  },
  {
    id: 'yohualli',
    name: 'Yohualli Ramirez',
    status: 'reserved',
    variety: 'hairless',
    size: 'intermediate',
    gender: 'female',
    color: 'black',
    ageDescription: 'Cachorra hembra recién nacida (reservada)',
    personalitySummary: 'Hembra intermedia de temperamento equilibrado, cariñosa y atenta a su entorno.',
    careConsiderations: [
      'Ejercicio diario moderado',
      'Estimulación cognitiva y entrenamiento positivo'
    ],
    lineageReference: 'Linaje Tonalli Xolos Ramírez',
    publicUrl: 'https://xolosramirez.com/xolos-disponibles.html#yohualli'
  },
  {
    id: 'tonalli',
    name: 'Tonalli Ramírez',
    status: 'reserved',
    variety: 'hairless',
    size: 'standard',
    gender: 'female',
    color: 'black',
    ageDescription: 'Cachorra recién nacida (reservada)',
    personalitySummary: 'Cachorra xoloitzcuintle sin pelo de temperamento dulce y equilibrado, actualmente en etapa de crianza temprana y reservada.',
    careConsiderations: [
      'Cuidado dérmico ancestral e hidratación periódica',
      'Protección contra cambios de temperatura'
    ],
    lineageReference: 'Linaje Tonalli Xolos Ramírez',
    publicUrl: 'https://xolosramirez.com/xolos-disponibles.html#tonalli'
  },
  {
    id: 'xochitl',
    name: 'Xochitl Ramirez',
    status: 'reserved',
    variety: 'hairless',
    size: 'intermediate',
    gender: 'female',
    color: 'bermejo',
    ageDescription: 'Cachorra recién nacida (reservada)',
    personalitySummary: 'Cachorra xoloitzcuintle de tonalidad bermeja y carácter sereno, en etapa de crecimiento protegida.',
    careConsiderations: [
      'Protección dérmica especializada para xoloitzcuintles bermejos',
      'Alimentación equilibrada de alta calidad'
    ],
    lineageReference: 'Linaje Tonalli Xolos Ramírez',
    publicUrl: 'https://xolosramirez.com/xolos-disponibles.html#xochitl'
  }
];

const OFFICIAL_CONTACT_CHANNELS = {
  kennelName: 'Xolos Ramírez',
  location: 'Ciudad de México, México (CDMX)',
  officialWebsite: 'https://xolosramirez.com',
  officialEmail: 'contacto@xolosarmy.xyz',
  whatsappDirect: 'https://wa.me/message/435RTKGJLTX2J1',
  calendarBookingNotice: 'Las videollamadas de presentación y asesoría personalizada se coordinan vía WhatsApp o formulario oficial en https://xolosramirez.com/contacto.html',
  socialChannels: [
    { platform: 'YouTube', url: 'https://www.youtube.com/@xolosramirez' },
    { platform: 'Facebook', url: 'https://www.facebook.com/share/1DYZWxYmqp/' },
    { platform: 'X / Twitter', url: 'https://x.com/xolosramirez1' },
    { platform: 'TikTok', url: 'https://www.tiktok.com/@xolosramirezoficial' },
    { platform: 'Snapchat', url: 'https://www.snapchat.com/add/xolos_ramirez?share_id=UFcVV_Fb_l8&locale=es-US' }
  ]
};

const OFFICIAL_DELIVERY_INFO = {
  kennelOrigin: 'Ciudad de México (CDMX)',
  zones: {
    cdmx_metropolitan: {
      zoneName: 'Ciudad de México y Área Metropolitana',
      method: 'Entrega personal directa y presencial con Fernando Ramírez en punto acordado o clínica veterinaria colaboradora.',
      requirements: 'Confirmación previa de esquema de vacunación y firma de compromiso de tutela responsable.'
    },
    national_mexico: {
      zoneName: 'República Mexicana (Nacional)',
      method: 'Acompañamiento personalizado en cabina aérea o transporte terrestre especializado.',
      welfareGuarantee: 'Nunca se documentan cachorros en áreas de carga comercial desatendida. Siempre viajan con acompañante humano o transportista certificado.'
    },
    international: {
      zoneName: 'Internacional (Estados Unidos, Europa, Latinoamérica)',
      method: 'Coordinación con servicios certificados de pet-travel en cabina (flight nanny) o entrega personal internacional.',
      documentation: [
        'Certificado Zoosanitario de Exportación emitido por SENASICA',
        'Microchip de identificación ISO 11784/11785 de 15 dígitos',
        'Cartilla de vacunación internacional con vacuna antirrábica y desparasitación vigente',
        'Pedigree de exportación FCM / FCI (según el país de destino)'
      ]
    }
  },
  animalWelfareProtocol: 'El bienestar del xoloitzcuintle es la prioridad absoluta. Las fechas de entrega se determinan por madurez física, destete natural y evaluación veterinaria individual.'
};

const ETHICAL_PRICING_PROCESS = {
  kennelPhilosophy: 'Crianza ética familiar y preservación biocultural del Xoloitzcuintle como Patrimonio Cultural y Vivo de México.',
  privatePricingNotice: 'Xolos Ramírez NO publica listas numéricas de precios abiertos en la web. Cada cachorro representa un linaje único y su asignación se basa en compatibilidad con la familia adoptante.',
  whatIsIncluded: [
    'Esquema de vacunación y desparasitación completo y certificado por médico veterinario zootecnista',
    'Microchip de identificación subcutáneo ISO homologado internacionalmente',
    'Certificado de pedigree FCM / FCI de pureza racial (cuando aplique según registro)',
    'Asesoría y acompañamiento vitalicio en nutrición, cuidados de la piel y conducta',
    'Acceso al ecosistema Tonalli y trazabilidad digital comunitaria en xolosArmy Network'
  ],
  inquiryProcess: [
    '1. Explora los perfiles públicos de cachorros disponibles en https://xolosramirez.com/xolos-disponibles.html',
    '2. Inicia contacto directo a través de WhatsApp oficial (https://wa.me/message/435RTKGJLTX2J1) o correo (contacto@xolosarmy.xyz)',
    '3. Conversación personalizada para entender tu estilo de vida, espacio y experiencia con la raza',
    '4. Confirmación formal de disponibilidad, condiciones particulares y reserva acordada directamente con Fernando Ramírez'
  ],
  contactWarning: 'Desconfía de intermediarios o cuentas no verificadas. Todo proceso oficial se realiza a través de los canales directos del criadero.'
};

/**
 * Public Xolos Data Adapter object.
 */
export const PublicXolosDataAdapter = {
  /**
   * List available xolos from public catalogue.
   * @param {Object} [filter]
   * @param {string} [filter.status] 'available' | 'reserved' | 'all'
   * @param {string} [filter.variety] 'hairless' | 'coated' | 'all'
   * @param {string} [filter.size] 'miniature' | 'intermediate' | 'standard' | 'all'
   */
  async listAvailableXolos(filter = {}) {
    const { status = 'all', variety = 'all', size = 'all' } = filter;
    let results = CANONICAL_PUBLIC_XOLOS;

    if (status && status !== 'all') {
      results = results.filter((x) => x.status.toLowerCase() === status.toLowerCase());
    }
    if (variety && variety !== 'all') {
      results = results.filter((x) => x.variety.toLowerCase() === variety.toLowerCase());
    }
    if (size && size !== 'all') {
      results = results.filter((x) => x.size.toLowerCase() === size.toLowerCase());
    }

    return {
      total: results.length,
      filterApplied: { status, variety, size },
      xolos: results.map((x) => ({
        id: x.id,
        name: x.name,
        status: x.status,
        variety: x.variety,
        size: x.size,
        gender: x.gender,
        color: x.color,
        ageDescription: x.ageDescription,
        publicUrl: x.publicUrl
      }))
    };
  },

  /**
   * Retrieve full public profile by ID.
   * @param {Object} params
   * @param {string} params.id
   */
  async getXoloProfile(params = {}) {
    const { id } = params;
    if (!id || typeof id !== 'string') {
      return {
        found: false,
        error: 'INVALID_ID',
        message: 'Debe proporcionar un identificador de ejemplar válido (e.g. "tlilxochitl", "xilonen").'
      };
    }

    const cleanId = id.trim().toLowerCase();
    const xolo = CANONICAL_PUBLIC_XOLOS.find((x) => x.id.toLowerCase() === cleanId);

    if (!xolo) {
      return {
        found: false,
        error: 'NOT_FOUND',
        message: `No se encontró un ejemplar público con el identificador "${cleanId}". Consulta list_available_xolos para ver los disponibles.`
      };
    }

    const xoloData = {
      id: xolo.id,
      name: xolo.name,
      status: xolo.status,
      variety: xolo.variety,
      size: xolo.size,
      gender: xolo.gender,
      color: xolo.color,
      ageDescription: xolo.ageDescription,
      personalitySummary: xolo.personalitySummary,
      careConsiderations: xolo.careConsiderations,
      lineageReference: xolo.lineageReference,
      publicUrl: xolo.publicUrl,
      directContactNotice: 'Para consultar disponibilidad vigente o iniciar el proceso de adopción, contacta a Fernando Ramírez vía WhatsApp: https://wa.me/message/435RTKGJLTX2J1'
    };

    if (xolo.birthDate) {
      xoloData.birthDate = xolo.birthDate;
    }

    return {
      found: true,
      xolo: xoloData
    };
  },

  /**
   * Retrieve official animal delivery protocols.
   * @param {Object} [params]
   * @param {string} [params.zone] 'cdmx' | 'national' | 'international' | 'all'
   */
  async getDeliveryInformation(params = {}) {
    const { zone = 'all' } = params;
    const cleanZone = (zone || 'all').toLowerCase();

    let details;
    if (cleanZone.includes('cdmx') || cleanZone.includes('local')) {
      details = { cdmx_metropolitan: OFFICIAL_DELIVERY_INFO.zones.cdmx_metropolitan };
    } else if (cleanZone.includes('national') || cleanZone.includes('nacional') || cleanZone.includes('mexico')) {
      details = { national_mexico: OFFICIAL_DELIVERY_INFO.zones.national_mexico };
    } else if (cleanZone.includes('inter') || cleanZone.includes('usa') || cleanZone.includes('eu')) {
      details = { international: OFFICIAL_DELIVERY_INFO.zones.international };
    } else {
      details = OFFICIAL_DELIVERY_INFO.zones;
    }

    return {
      kennelOrigin: OFFICIAL_DELIVERY_INFO.kennelOrigin,
      animalWelfareProtocol: OFFICIAL_DELIVERY_INFO.animalWelfareProtocol,
      zones: details
    };
  },

  /**
   * Retrieve verified contact channels.
   */
  async getContactOptions() {
    return OFFICIAL_CONTACT_CHANNELS;
  },

  /**
   * Retrieve ethical breeding and pricing inquiry process information.
   * Strictly enforces absence of numerical price figures.
   */
  async getPriceProcessInformation() {
    return ETHICAL_PRICING_PROCESS;
  }
};

if (typeof window !== 'undefined') {
  window.PublicXolosDataAdapter = PublicXolosDataAdapter;
}
