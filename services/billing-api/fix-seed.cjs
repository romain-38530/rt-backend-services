const fs = require('fs');
const path = './index.js';

let content = fs.readFileSync(path, 'utf8');

// Corriger les adresses (objets -> strings)
content = content.replace(
  "pickupAddress: { city: 'Lyon', postalCode: '69001', country: 'FR' }",
  "pickupAddress: 'Lyon 69001, France'"
);

content = content.replace(
  "deliveryAddress: { city: 'Paris', postalCode: '75001', country: 'FR' }",
  "deliveryAddress: 'Paris 75001, France'"
);

// Corriger les statuts
content = content.replace(
  "const statuses = ['pending', 'sent_to_industrial', 'validated_industrial', 'payment_pending', 'paid'];",
  "const statuses = ['draft', 'generated', 'pending_validation', 'validated', 'finalized', 'exported'];"
);

// Corriger cargoDetails -> cargo
content = content.replace(
  /cargoDetails: \{/g,
  "cargo: {"
);

fs.writeFileSync(path, content);
console.log('SUCCESS: Seed data fixed');
