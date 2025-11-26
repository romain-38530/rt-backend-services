/**
 * Utilitaire d'import XML pour les commandes
 */

const xml2js = require('xml2js');
const fs = require('fs').promises;

/**
 * Parse un fichier XML et retourne un tableau de commandes
 * @param {String} filePath - Chemin du fichier XML
 * @returns {Promise<Object>} - { orders: Array, errors: Array }
 */
async function parseXML(filePath) {
  try {
    const xmlContent = await fs.readFile(filePath, 'utf8');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlContent);

    const orders = [];
    const errors = [];

    // Supporter différents formats XML
    let orderNodes = [];

    if (result.orders && result.orders.order) {
      orderNodes = Array.isArray(result.orders.order)
        ? result.orders.order
        : [result.orders.order];
    } else if (result.root && result.root.order) {
      orderNodes = Array.isArray(result.root.order)
        ? result.root.order
        : [result.root.order];
    } else if (result.order) {
      orderNodes = Array.isArray(result.order) ? result.order : [result.order];
    }

    for (let i = 0; i < orderNodes.length; i++) {
      try {
        const order = mapXMLToOrder(orderNodes[i]);
        orders.push(order);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: orderNodes[i]
        });
      }
    }

    return { orders, errors };
  } catch (error) {
    throw new Error(`Erreur parsing XML: ${error.message}`);
  }
}

/**
 * Mappe un nœud XML vers le format de commande
 * @param {Object} node - Nœud XML parsé
 * @returns {Object} - Commande formatée
 */
function mapXMLToOrder(node) {
  return {
    externalReference: node.reference || node.$.id,

    pickup: {
      name: node.pickup?.name || node.expediteur?.nom,
      street: node.pickup?.street || node.expediteur?.adresse,
      city: node.pickup?.city || node.expediteur?.ville,
      postalCode: node.pickup?.postalCode || node.expediteur?.codePostal,
      country: node.pickup?.country || node.expediteur?.pays || 'France',
      contact: {
        name: node.pickup?.contact?.name || node.expediteur?.contact,
        phone: node.pickup?.contact?.phone || node.expediteur?.telephone,
        email: node.pickup?.contact?.email || node.expediteur?.email
      }
    },

    delivery: {
      name: node.delivery?.name || node.destinataire?.nom,
      street: node.delivery?.street || node.destinataire?.adresse,
      city: node.delivery?.city || node.destinataire?.ville,
      postalCode: node.delivery?.postalCode || node.destinataire?.codePostal,
      country: node.delivery?.country || node.destinataire?.pays || 'France',
      contact: {
        name: node.delivery?.contact?.name || node.destinataire?.contact,
        phone: node.delivery?.contact?.phone || node.destinataire?.telephone,
        email: node.delivery?.contact?.email || node.destinataire?.email
      }
    },

    pickupDate: parseXMLDate(node.pickupDate || node.dateEnlevement),
    deliveryDate: parseXMLDate(node.deliveryDate || node.dateLivraison),

    cargo: {
      type: mapCargoType(node.cargo?.type || node.marchandise?.type),
      quantity: parseInt(node.cargo?.quantity || node.marchandise?.quantite) || 1,
      weight: {
        value: parseFloat(node.cargo?.weight || node.marchandise?.poids) || 0,
        unit: 'kg'
      },
      description: node.cargo?.description || node.marchandise?.description
    },

    transportType: node.transportType || node.typeTransport || 'standard',
    vehicleType: node.vehicleType || node.typeVehicule,

    services: {
      tailgate: parseXMLBoolean(node.services?.tailgate || node.services?.hayon),
      palletJack: parseXMLBoolean(node.services?.palletJack || node.services?.transpalette),
      insurance: parseXMLBoolean(node.services?.insurance || node.services?.assurance),
      adr: parseXMLBoolean(node.services?.adr),
      temperature_controlled: parseXMLBoolean(node.services?.temperature || node.services?.frigo)
    },

    pickupInstructions: node.pickupInstructions || node.instructionsEnlevement,
    deliveryInstructions: node.deliveryInstructions || node.instructionsLivraison,

    metadata: {
      importSource: 'XML',
      importedAt: new Date()
    }
  };
}

/**
 * Parse une date XML
 * @param {String} dateStr
 * @returns {Date}
 */
function parseXMLDate(dateStr) {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse un booléen XML
 * @param {String|Boolean} value
 * @returns {Boolean}
 */
function parseXMLBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (!value) return false;

  const normalized = value.toString().toLowerCase();
  return ['true', 'yes', 'oui', '1'].includes(normalized);
}

/**
 * Mappe les types de marchandise
 * @param {String} type
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
 * Génère un template XML pour l'import
 * @returns {String} - Contenu XML
 */
function generateXMLTemplate() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<orders>
  <order>
    <reference>CMD001</reference>
    <pickup>
      <name>Société Expéditeur SA</name>
      <street>10 Rue de la Paix</street>
      <city>Paris</city>
      <postalCode>75001</postalCode>
      <country>France</country>
      <contact>
        <name>Jean Dupont</name>
        <phone>+33612345678</phone>
        <email>jean.dupont@example.com</email>
      </contact>
    </pickup>
    <delivery>
      <name>Société Destinataire SARL</name>
      <street>25 Avenue des Champs</street>
      <city>Lyon</city>
      <postalCode>69001</postalCode>
      <country>France</country>
      <contact>
        <name>Marie Martin</name>
        <phone>+33698765432</phone>
        <email>marie.martin@example.com</email>
      </contact>
    </delivery>
    <pickupDate>2024-11-25</pickupDate>
    <deliveryDate>2024-11-26</deliveryDate>
    <cargo>
      <type>palette</type>
      <quantity>10</quantity>
      <weight>500</weight>
      <description>Marchandises diverses</description>
    </cargo>
    <transportType>standard</transportType>
    <vehicleType>19T</vehicleType>
    <services>
      <tailgate>true</tailgate>
      <palletJack>false</palletJack>
      <insurance>true</insurance>
      <adr>false</adr>
      <temperature>false</temperature>
    </services>
    <pickupInstructions>Appeler avant arrivée</pickupInstructions>
    <deliveryInstructions>Livraison quai 3</deliveryInstructions>
  </order>
</orders>`;
}

module.exports = {
  parseXML,
  mapXMLToOrder,
  generateXMLTemplate
};
