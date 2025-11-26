/**
 * Utilitaire d'import CSV pour les commandes
 */

const csv = require('csv-parser');
const fs = require('fs');
const { Transform } = require('stream');

/**
 * Parse un fichier CSV et retourne un tableau de commandes
 * @param {String} filePath - Chemin du fichier CSV
 * @returns {Promise<Array>} - Tableau de commandes parsées
 */
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];

    fs.createReadStream(filePath)
      .pipe(csv({
        separator: ';', // ou ',' selon le format
        mapHeaders: ({ header }) => header.trim().toLowerCase()
      }))
      .on('data', (row) => {
        try {
          const order = mapCSVToOrder(row);
          results.push(order);
        } catch (error) {
          errors.push({
            row: results.length + 1,
            error: error.message,
            data: row
          });
        }
      })
      .on('end', () => {
        resolve({ orders: results, errors });
      })
      .on('error', reject);
  });
}

/**
 * Mappe les colonnes CSV vers le format de commande
 * @param {Object} row - Ligne CSV
 * @returns {Object} - Commande formatée
 */
function mapCSVToOrder(row) {
  return {
    externalReference: row.reference || row.ref,

    pickup: {
      name: row.pickup_name || row.expediteur,
      street: row.pickup_street || row.pickup_adresse,
      city: row.pickup_city || row.pickup_ville,
      postalCode: row.pickup_postal || row.pickup_cp,
      country: row.pickup_country || 'France',
      contact: {
        name: row.pickup_contact_name,
        phone: row.pickup_contact_phone || row.pickup_tel,
        email: row.pickup_contact_email
      }
    },

    delivery: {
      name: row.delivery_name || row.destinataire,
      street: row.delivery_street || row.delivery_adresse,
      city: row.delivery_city || row.delivery_ville,
      postalCode: row.delivery_postal || row.delivery_cp,
      country: row.delivery_country || 'France',
      contact: {
        name: row.delivery_contact_name,
        phone: row.delivery_contact_phone || row.delivery_tel,
        email: row.delivery_contact_email
      }
    },

    pickupDate: parseDate(row.pickup_date || row.date_enlevement),
    deliveryDate: parseDate(row.delivery_date || row.date_livraison),

    cargo: {
      type: mapCargoType(row.cargo_type || row.type_marchandise),
      quantity: parseInt(row.quantity || row.quantite) || 1,
      weight: {
        value: parseFloat(row.weight || row.poids) || 0,
        unit: 'kg'
      },
      description: row.description || row.marchandise
    },

    transportType: row.transport_type || row.type_transport || 'standard',
    vehicleType: row.vehicle_type || row.type_vehicule,

    services: {
      tailgate: parseBoolean(row.tailgate || row.hayon),
      palletJack: parseBoolean(row.pallet_jack || row.transpalette),
      insurance: parseBoolean(row.insurance || row.assurance),
      adr: parseBoolean(row.adr),
      temperature_controlled: parseBoolean(row.temperature || row.frigo)
    },

    pickupInstructions: row.pickup_instructions || row.instructions_enlevement,
    deliveryInstructions: row.delivery_instructions || row.instructions_livraison,

    metadata: {
      importSource: 'CSV',
      importedAt: new Date()
    }
  };
}

/**
 * Parse une date dans différents formats
 * @param {String} dateStr - Date en string
 * @returns {Date}
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Format DD/MM/YYYY
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);

    if (year < 100) {
      year += 2000;
    }

    return new Date(year, month, day);
  }

  // Essayer le parsing standard
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Mappe les types de marchandise
 * @param {String} type - Type en CSV
 * @returns {String}
 */
function mapCargoType(type) {
  if (!type) return 'palette';

  const normalized = type.toLowerCase();
  if (normalized.includes('palette') || normalized.includes('pallet')) return 'palette';
  if (normalized.includes('colis') || normalized.includes('parcel')) return 'colis';
  if (normalized.includes('vrac') || normalized.includes('bulk')) return 'vrac';
  if (normalized.includes('container')) return 'container';

  return 'autre';
}

/**
 * Parse un booléen depuis différents formats
 * @param {String} value
 * @returns {Boolean}
 */
function parseBoolean(value) {
  if (!value) return false;

  const normalized = value.toString().toLowerCase();
  return ['true', 'yes', 'oui', '1', 'x'].includes(normalized);
}

/**
 * Valide les données d'une commande importée
 * @param {Object} order
 * @returns {Object} { valid: Boolean, errors: Array }
 */
function validateOrder(order) {
  const errors = [];

  // Validations obligatoires
  if (!order.pickup?.name) errors.push('Nom expéditeur manquant');
  if (!order.pickup?.street) errors.push('Adresse expéditeur manquante');
  if (!order.pickup?.city) errors.push('Ville expéditeur manquante');
  if (!order.pickup?.postalCode) errors.push('Code postal expéditeur manquant');

  if (!order.delivery?.name) errors.push('Nom destinataire manquant');
  if (!order.delivery?.street) errors.push('Adresse destinataire manquante');
  if (!order.delivery?.city) errors.push('Ville destinataire manquante');
  if (!order.delivery?.postalCode) errors.push('Code postal destinataire manquant');

  if (!order.pickupDate) errors.push('Date enlèvement manquante');
  if (!order.deliveryDate) errors.push('Date livraison manquante');

  if (!order.cargo?.type) errors.push('Type marchandise manquant');
  if (!order.cargo?.quantity || order.cargo.quantity <= 0) {
    errors.push('Quantité invalide');
  }

  // Validation des dates
  if (order.pickupDate && order.deliveryDate) {
    if (order.deliveryDate < order.pickupDate) {
      errors.push('Date livraison antérieure à date enlèvement');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Génère un template CSV pour l'import
 * @returns {String} - Contenu CSV
 */
function generateCSVTemplate() {
  const headers = [
    'reference',
    'pickup_name',
    'pickup_street',
    'pickup_city',
    'pickup_postal',
    'pickup_country',
    'pickup_contact_name',
    'pickup_contact_phone',
    'pickup_contact_email',
    'delivery_name',
    'delivery_street',
    'delivery_city',
    'delivery_postal',
    'delivery_country',
    'delivery_contact_name',
    'delivery_contact_phone',
    'delivery_contact_email',
    'pickup_date',
    'delivery_date',
    'cargo_type',
    'quantity',
    'weight',
    'description',
    'transport_type',
    'vehicle_type',
    'tailgate',
    'pallet_jack',
    'insurance',
    'adr',
    'temperature',
    'pickup_instructions',
    'delivery_instructions'
  ];

  const exampleRow = [
    'CMD001',
    'Société Expéditeur SA',
    '10 Rue de la Paix',
    'Paris',
    '75001',
    'France',
    'Jean Dupont',
    '+33612345678',
    'jean.dupont@example.com',
    'Société Destinataire SARL',
    '25 Avenue des Champs',
    'Lyon',
    '69001',
    'France',
    'Marie Martin',
    '+33698765432',
    'marie.martin@example.com',
    '25/11/2024',
    '26/11/2024',
    'palette',
    '10',
    '500',
    'Marchandises diverses',
    'standard',
    '19T',
    'oui',
    'non',
    'oui',
    'non',
    'non',
    'Appeler avant arrivée',
    'Livraison quai 3'
  ];

  return headers.join(';') + '\n' + exampleRow.join(';');
}

module.exports = {
  parseCSV,
  mapCSVToOrder,
  validateOrder,
  generateCSVTemplate
};
