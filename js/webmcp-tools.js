/**
 * @file webmcp-tools.js
 * WebMCP read-only tools registration for Xolos Ramírez.
 *
 * Implements milestone WM-XR1 as specified in XR-AC0 Revision B.
 * Registers 5 read-only tools via `document.modelContext.registerTool(...)`.
 *
 * INVARIANTS:
 * - Feature detection: executes ONLY if document.modelContext.registerTool is present.
 * - Progressive enhancement: completely dormant when WebMCP is unavailable.
 * - sideEffects = "none" for all 5 tools.
 * - Zero PII, zero private pricing disclosure.
 * - Non-blocking, zero interference with GTM/GA4/SEO/Formspree/WhatsApp.
 */

import { PublicXolosDataAdapter } from './public-xolos-data-adapter.js';

export const WEBMCP_TOOLS_DEFINITIONS = [
  {
    name: 'list_available_xolos',
    description: 'Lista los cachorros xoloitzcuintles públicos disponibles o reservados de Xolos Ramírez con filtros por estado, variedad y talla.',
    sideEffects: 'none',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['available', 'reserved', 'all'],
          description: 'Filtro por estado de disponibilidad (por defecto: "all")'
        },
        variety: {
          type: 'string',
          enum: ['hairless', 'coated', 'all'],
          description: 'Filtro por variedad de manto: sin pelo o con pelo (por defecto: "all")'
        },
        size: {
          type: 'string',
          enum: ['miniature', 'intermediate', 'standard', 'all'],
          description: 'Filtro por talla: miniatura, intermedio o estándar (por defecto: "all")'
        }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      required: ['total', 'filterApplied', 'xolos'],
      properties: {
        total: { type: 'integer', minimum: 0 },
        filterApplied: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            variety: { type: 'string' },
            size: { type: 'string' }
          }
        },
        xolos: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'status', 'variety', 'size', 'gender', 'color', 'publicUrl'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
              variety: { type: 'string' },
              size: { type: 'string' },
              gender: { type: 'string' },
              color: { type: 'string' },
              ageDescription: { type: 'string' },
              publicUrl: { type: 'string', format: 'uri' }
            }
          }
        }
      }
    },
    handler: async (params) => {
      return await PublicXolosDataAdapter.listAvailableXolos(params || {});
    }
  },
  {
    name: 'get_xolo_profile',
    description: 'Obtiene el perfil público detallado, temperamento, cuidados y referencia genealógica de un xoloitzcuintle específico.',
    sideEffects: 'none',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'Identificador del ejemplar (e.g. "tlilxochitl", "xilonen", "yohualli", "iztli")'
        }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      required: ['found'],
      properties: {
        found: { type: 'boolean' },
        error: { type: 'string' },
        message: { type: 'string' },
        xolo: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string' },
            variety: { type: 'string' },
            size: { type: 'string' },
            gender: { type: 'string' },
            color: { type: 'string' },
            birthDate: { type: 'string' },
            ageDescription: { type: 'string' },
            personalitySummary: { type: 'string' },
            careConsiderations: {
              type: 'array',
              items: { type: 'string' }
            },
            lineageReference: { type: 'string' },
            publicUrl: { type: 'string', format: 'uri' },
            directContactNotice: { type: 'string' }
          }
        }
      }
    },
    handler: async (params) => {
      return await PublicXolosDataAdapter.getXoloProfile(params || {});
    }
  },
  {
    name: 'get_delivery_information',
    description: 'Consulta los protocolos de transporte, acompañamiento y entrega nacional e internacional garantizando bienestar animal.',
    sideEffects: 'none',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          enum: ['cdmx', 'national', 'international', 'all'],
          description: 'Zona de entrega deseada (por defecto: "all")'
        }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      required: ['kennelOrigin', 'animalWelfareProtocol', 'zones'],
      properties: {
        kennelOrigin: { type: 'string' },
        animalWelfareProtocol: { type: 'string' },
        zones: { type: 'object' }
      }
    },
    handler: async (params) => {
      return await PublicXolosDataAdapter.getDeliveryInformation(params || {});
    }
  },
  {
    name: 'get_contact_options',
    description: 'Devuelve los canales oficiales verificados para comunicarse con el criadero Xolos Ramírez (WhatsApp, correo, redes sociales).',
    sideEffects: 'none',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      required: ['kennelName', 'officialWebsite', 'officialEmail', 'whatsappDirect'],
      properties: {
        kennelName: { type: 'string' },
        location: { type: 'string' },
        officialWebsite: { type: 'string', format: 'uri' },
        officialEmail: { type: 'string' },
        whatsappDirect: { type: 'string', format: 'uri' },
        calendarBookingNotice: { type: 'string' },
        socialChannels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string' },
              url: { type: 'string', format: 'uri' }
            }
          }
        }
      }
    },
    handler: async () => {
      return await PublicXolosDataAdapter.getContactOptions();
    }
  },
  {
    name: 'get_price_process_information',
    description: 'Explica la filosofía de crianza ética, qué incluye cada cachorro y el proceso de consulta personalizada. No publica precios numéricos abiertos.',
    sideEffects: 'none',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      required: ['kennelPhilosophy', 'privatePricingNotice', 'whatIsIncluded', 'inquiryProcess'],
      properties: {
        kennelPhilosophy: { type: 'string' },
        privatePricingNotice: { type: 'string' },
        whatIsIncluded: {
          type: 'array',
          items: { type: 'string' }
        },
        inquiryProcess: {
          type: 'array',
          items: { type: 'string' }
        },
        contactWarning: { type: 'string' }
      }
    },
    handler: async () => {
      return await PublicXolosDataAdapter.getPriceProcessInformation();
    }
  }
];

/**
 * Register WebMCP tools on document.modelContext if supported.
 * Returns the registration status summary.
 */
export function registerWebMcpTools() {
  if (
    typeof document === 'undefined' ||
    !('modelContext' in document) ||
    !document.modelContext ||
    typeof document.modelContext.registerTool !== 'function'
  ) {
    // WebMCP not supported in this runtime; progressive enhancement fallback.
    return { registered: false, reason: 'WEBMCP_UNAVAILABLE', count: 0 };
  }

  let registeredCount = 0;
  for (const tool of WEBMCP_TOOLS_DEFINITIONS) {
    try {
      document.modelContext.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        sideEffects: tool.sideEffects,
        handler: tool.handler
      });
      registeredCount++;
    } catch (err) {
      // Invariant: Failures in tool registration must never break page execution.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[WebMCP] Could not register tool ${tool.name}:`, err);
      }
    }
  }

  return { registered: true, count: registeredCount };
}

// Auto-register on import if environment supports it
registerWebMcpTools();
