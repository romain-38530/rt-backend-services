/**
 * RT Technologie - Suite Chatbots
 * Modeles de donnees pour le systeme de chatbots intelligents
 * Version: 1.0.0
 */

// ============================================================================
// TYPES DE CHATBOTS
// ============================================================================

const ChatbotTypes = {
  PLANIF_IA: 'planif_ia',           // Industriels
  ROUTIER: 'routier',               // Transporteurs
  QUAI_WMS: 'quai_wms',             // Logisticiens
  LIVRAISONS: 'livraisons',         // Destinataires
  EXPEDITION: 'expedition',         // Fournisseurs
  FREIGHT_IA: 'freight_ia',         // Transitaires
  COPILOTE_CHAUFFEUR: 'copilote',   // Conducteurs (mobile)
  HELPBOT: 'helpbot'                // Support technique
};

// ============================================================================
// TYPES D'UTILISATEURS
// ============================================================================

const UserRoles = {
  INDUSTRIAL: 'industrial',         // Donneur d'ordre industriel
  CARRIER: 'carrier',               // Transporteur
  LOGISTICS: 'logistics',           // Logisticien
  RECIPIENT: 'recipient',           // Destinataire
  SUPPLIER: 'supplier',             // Fournisseur
  FORWARDER: 'forwarder',           // Transitaire
  DRIVER: 'driver',                 // Chauffeur
  ADMIN: 'admin',                   // Administrateur
  TECHNICIAN: 'technician'          // Technicien support
};

// ============================================================================
// NIVEAUX DE PRIORITE (RT HelpBot)
// ============================================================================

const PriorityLevels = {
  STANDARD: 3,    // Questions utilisation, tutoriel, info generale
  IMPORTANT: 2,   // RDV impossible, erreur Affret IA, signature
  CRITICAL: 1     // Blocage total, documents non transmis, API ERP
};

const PriorityDescriptions = {
  [PriorityLevels.STANDARD]: {
    name: 'Standard',
    description: 'Questions utilisation, tutoriel, information generale',
    examples: ['Comment utiliser...', 'Ou trouver...', 'Tutoriel demande'],
    maxBotInteractions: 5,
    autoTransfer: false
  },
  [PriorityLevels.IMPORTANT]: {
    name: 'Important',
    description: 'Problemes fonctionnels necessitant attention',
    examples: ['RDV impossible', 'Erreur Affret IA', 'Signature echouee'],
    maxBotInteractions: 3,
    autoTransfer: true
  },
  [PriorityLevels.CRITICAL]: {
    name: 'Urgent/Critique',
    description: 'Blocage total necessitant intervention immediate',
    examples: ['Blocage total', 'Documents non transmis', 'API ERP down'],
    maxBotInteractions: 1,
    autoTransfer: true
  }
};

// ============================================================================
// STATUTS DE CONVERSATION
// ============================================================================

const ConversationStatus = {
  ACTIVE: 'active',
  WAITING_USER: 'waiting_user',
  WAITING_BOT: 'waiting_bot',
  TRANSFERRED: 'transferred',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  ESCALATED: 'escalated'
};

// ============================================================================
// TYPES DE MESSAGES
// ============================================================================

const MessageTypes = {
  USER: 'user',
  BOT: 'bot',
  SYSTEM: 'system',
  TECHNICIAN: 'technician',
  DIAGNOSTIC: 'diagnostic',
  ACTION: 'action',
  ATTACHMENT: 'attachment'
};

// ============================================================================
// CATEGORIES DE DEMANDES
// ============================================================================

const RequestCategories = {
  TECHNICAL: 'technical',           // Probleme technique
  FUNCTIONAL: 'functional',         // Question fonctionnelle
  DOCUMENTATION: 'documentation',   // Demande de doc/tutoriel
  BUG: 'bug',                       // Signalement de bug
  FEATURE: 'feature',               // Demande de fonctionnalite
  BILLING: 'billing',               // Facturation/Paiement
  INTEGRATION: 'integration',       // Integration ERP/API
  TRACKING: 'tracking',             // Suivi transport
  PLANNING: 'planning',             // Planning/RDV
  DOCUMENTS: 'documents'            // Documents/CMR
};

// ============================================================================
// MODULES DE LA PLATEFORME
// ============================================================================

const PlatformModules = {
  SUBSCRIPTIONS: 'subscriptions',
  CONTRACTS: 'contracts',
  ECMR: 'ecmr',
  ACCOUNT_TYPES: 'account_types',
  CARRIER_REFERENCING: 'carrier_referencing',
  PRICING_GRIDS: 'pricing_grids',
  TRANSPORT_ORDERS: 'transport_orders',
  TRACKING: 'tracking',
  GEOFENCING: 'geofencing',
  OCR: 'ocr',
  DOCUMENTS: 'documents',
  AFFRETIA: 'affretia',
  PLANNING: 'planning',
  STRIPE: 'stripe',
  NOTIFICATIONS: 'notifications',
  WMS: 'wms',
  ERP_INTEGRATION: 'erp_integration'
};

// ============================================================================
// ACTIONS DIAGNOSTIQUES
// ============================================================================

const DiagnosticActions = {
  CHECK_API_STATUS: 'check_api_status',
  CHECK_ERP_CONNECTION: 'check_erp_connection',
  CHECK_CARRIER_CONNECTION: 'check_carrier_connection',
  VALIDATE_DOCUMENTS: 'validate_documents',
  CHECK_SERVER_STATUS: 'check_server_status',
  CHECK_FILE_FORMAT: 'check_file_format',
  CHECK_USER_PERMISSIONS: 'check_user_permissions',
  CHECK_TRACKING_STATUS: 'check_tracking_status',
  CHECK_PAYMENT_STATUS: 'check_payment_status',
  CHECK_SIGNATURE_STATUS: 'check_signature_status'
};

// ============================================================================
// STATUTS DE TICKET
// ============================================================================

const TicketStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING_USER: 'waiting_user',
  WAITING_TECH: 'waiting_tech',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REOPENED: 'reopened'
};

// ============================================================================
// SCHEMAS MONGODB
// ============================================================================

/**
 * Schema Conversation
 */
const ConversationSchema = {
  conversationId: String,           // UUID unique
  chatbotType: String,              // Type de chatbot
  userId: 'ObjectId',               // Reference utilisateur
  organizationId: 'ObjectId',       // Reference organisation
  userRole: String,                 // Role utilisateur
  status: String,                   // Statut conversation
  priority: Number,                 // Niveau de priorite
  category: String,                 // Categorie de demande
  module: String,                   // Module concerne
  context: {
    orderReference: String,         // Reference commande en cours
    currentPage: String,            // Page actuelle
    previousActions: Array,         // Actions precedentes
    userAgent: String,              // Navigateur/Device
    ipAddress: String               // IP utilisateur
  },
  messages: [{
    messageId: String,
    type: String,                   // user/bot/system/technician
    content: String,
    attachments: Array,
    timestamp: Date,
    metadata: Object
  }],
  diagnostics: [{
    action: String,
    result: Object,
    timestamp: Date
  }],
  botInteractions: Number,          // Nombre d'interactions bot
  transferredAt: Date,              // Date transfert technicien
  transferredTo: 'ObjectId',        // Technicien assigne
  ticketId: String,                 // Reference ticket si cree
  resolution: {
    resolvedBy: String,             // bot/technician
    resolvedAt: Date,
    solution: String,
    feedback: {
      rating: Number,               // 1-5
      comment: String
    }
  },
  createdAt: Date,
  updatedAt: Date,
  closedAt: Date
};

/**
 * Schema Ticket Support
 */
const TicketSchema = {
  ticketId: String,                 // TKT-YYYYMM-XXXXX
  conversationId: String,           // Reference conversation
  userId: 'ObjectId',
  organizationId: 'ObjectId',
  userRole: String,
  status: String,
  priority: Number,
  category: String,
  module: String,
  subject: String,
  description: String,
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: Date
  }],
  assignedTo: 'ObjectId',           // Technicien assigne
  history: [{
    action: String,                 // created/assigned/updated/resolved/closed
    performedBy: 'ObjectId',
    timestamp: Date,
    details: Object
  }],
  sla: {
    responseDeadline: Date,
    resolutionDeadline: Date,
    firstResponseAt: Date,
    resolvedAt: Date
  },
  teamsNotificationId: String,      // ID notification Teams
  createdAt: Date,
  updatedAt: Date,
  closedAt: Date
};

/**
 * Schema Base de Connaissances
 */
const KnowledgeBaseSchema = {
  articleId: String,
  title: String,
  content: String,
  summary: String,
  category: String,
  module: String,
  chatbotTypes: Array,              // Chatbots concernes
  userRoles: Array,                 // Roles concernes
  keywords: Array,
  relatedArticles: Array,
  videoUrl: String,
  steps: [{
    order: Number,
    title: String,
    content: String,
    imageUrl: String
  }],
  viewCount: Number,
  helpfulCount: Number,
  notHelpfulCount: Number,
  status: String,                   // draft/published/archived
  createdAt: Date,
  updatedAt: Date,
  createdBy: 'ObjectId'
};

/**
 * Schema FAQ
 */
const FAQSchema = {
  faqId: String,
  question: String,
  answer: String,
  category: String,
  module: String,
  chatbotTypes: Array,
  userRoles: Array,
  keywords: Array,
  priority: Number,                 // Ordre d'affichage
  viewCount: Number,
  helpfulCount: Number,
  status: String,
  createdAt: Date,
  updatedAt: Date
};

// ============================================================================
// TEMPLATES DE REPONSES PAR CHATBOT
// ============================================================================

const ChatbotGreetings = {
  [ChatbotTypes.PLANIF_IA]: {
    greeting: "Bonjour ! Je suis l'Assistant Planif'IA, votre aide pour la gestion de vos transports industriels. Comment puis-je vous aider aujourd'hui ?",
    suggestions: [
      "Comment connecter mon ERP ?",
      "Activer Affret.IA",
      "Gerer mes transporteurs",
      "Acceder a la bourse de fret"
    ]
  },
  [ChatbotTypes.ROUTIER]: {
    greeting: "Bonjour ! Je suis l'Assistant Routier, dedie aux transporteurs. Comment puis-je vous accompagner ?",
    suggestions: [
      "Integrer mes grilles tarifaires",
      "Prendre un RDV",
      "Activer le tracking IA",
      "Deposer un POD"
    ]
  },
  [ChatbotTypes.QUAI_WMS]: {
    greeting: "Bonjour ! Je suis l'Assistant Quai & WMS pour la gestion de votre plateforme logistique. Que souhaitez-vous faire ?",
    suggestions: [
      "Gerer le planning quai",
      "Configurer les creneaux",
      "Portail chauffeur",
      "Integration WMS"
    ]
  },
  [ChatbotTypes.LIVRAISONS]: {
    greeting: "Bonjour ! Je suis l'Assistant Livraisons. Je vous aide a suivre vos receptions. Comment puis-je vous aider ?",
    suggestions: [
      "Planifier un RDV livraison",
      "Consulter mes documents",
      "Suivi temps reel",
      "Valider un transport"
    ]
  },
  [ChatbotTypes.EXPEDITION]: {
    greeting: "Bonjour ! Je suis l'Assistant Expedition pour gerer vos envois. Que puis-je faire pour vous ?",
    suggestions: [
      "Creer une expedition",
      "Suivre mes prises en charge",
      "Contacter un transporteur",
      "Documents d'expedition"
    ]
  },
  [ChatbotTypes.FREIGHT_IA]: {
    greeting: "Bonjour ! Je suis l'Assistant Freight IA pour vos operations de transit. Comment puis-je vous aider ?",
    suggestions: [
      "Offre import/export",
      "Pre-acheminement",
      "Post-acheminement",
      "Integration transporteurs"
    ]
  },
  [ChatbotTypes.COPILOTE_CHAUFFEUR]: {
    greeting: "Bonjour ! Je suis votre Copilote Chauffeur. Que souhaitez-vous faire ?",
    suggestions: [
      "Activer ma mission",
      "Mettre a jour mon statut",
      "Deposer un document",
      "Signer electroniquement"
    ]
  },
  [ChatbotTypes.HELPBOT]: {
    greeting: "Bonjour ! Je suis RT HelpBot, votre assistant technique. Quelle est la nature de votre demande ?",
    categories: [
      { icon: "wrench", label: "Probleme technique", value: "technical" },
      { icon: "question", label: "Question fonctionnelle", value: "functional" },
      { icon: "book", label: "Documentation / Tutoriel", value: "documentation" }
    ]
  }
};

// ============================================================================
// MAPPING CHATBOT PAR ROLE
// ============================================================================

const RoleToChatbot = {
  [UserRoles.INDUSTRIAL]: ChatbotTypes.PLANIF_IA,
  [UserRoles.CARRIER]: ChatbotTypes.ROUTIER,
  [UserRoles.LOGISTICS]: ChatbotTypes.QUAI_WMS,
  [UserRoles.RECIPIENT]: ChatbotTypes.LIVRAISONS,
  [UserRoles.SUPPLIER]: ChatbotTypes.EXPEDITION,
  [UserRoles.FORWARDER]: ChatbotTypes.FREIGHT_IA,
  [UserRoles.DRIVER]: ChatbotTypes.COPILOTE_CHAUFFEUR,
  [UserRoles.ADMIN]: ChatbotTypes.HELPBOT,
  [UserRoles.TECHNICIAN]: ChatbotTypes.HELPBOT
};

// ============================================================================
// CONFIGURATION SLA
// ============================================================================

const SLAConfig = {
  [PriorityLevels.CRITICAL]: {
    firstResponse: 15,      // 15 minutes
    resolution: 60          // 1 heure
  },
  [PriorityLevels.IMPORTANT]: {
    firstResponse: 60,      // 1 heure
    resolution: 240         // 4 heures
  },
  [PriorityLevels.STANDARD]: {
    firstResponse: 240,     // 4 heures
    resolution: 1440        // 24 heures
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ChatbotTypes,
  UserRoles,
  PriorityLevels,
  PriorityDescriptions,
  ConversationStatus,
  MessageTypes,
  RequestCategories,
  PlatformModules,
  DiagnosticActions,
  TicketStatus,
  ConversationSchema,
  TicketSchema,
  KnowledgeBaseSchema,
  FAQSchema,
  ChatbotGreetings,
  RoleToChatbot,
  SLAConfig
};
