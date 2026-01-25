const ovh = require('ovh')({
  endpoint: 'ovh-eu',
  appKey: '569274d0e751d75a',
  appSecret: '2c835ed95ffed136580afc95b1989271',
  consumerKey: '05a1a0b7aa9b32b8f13c29004b494283'
});

const domain = 'symphonia-controltower.com';
const newCloudFront = 'd3800xay5mlft6.cloudfront.net';

async function updateDNS() {
  try {
    // Lister les enregistrements pour transporteur
    console.log('Fetching existing records...');
    const records = await ovh.requestPromised('GET', `/domain/zone/${domain}/record?subDomain=transporteur`);
    console.log('Existing records for transporteur:', records);

    // Pour chaque record, récupérer les détails et supprimer si c'est un CNAME
    if (records && Array.isArray(records)) {
      for (const recordId of records) {
        const recordDetails = await ovh.requestPromised('GET', `/domain/zone/${domain}/record/${recordId}`);
        console.log('Record details:', recordDetails);

        if (recordDetails.fieldType === 'CNAME') {
          console.log(`Deleting old CNAME record ${recordId}...`);
          await ovh.requestPromised('DELETE', `/domain/zone/${domain}/record/${recordId}`);
          console.log('Deleted');
        }
      }
    }

    // Créer le nouveau CNAME vers CloudFront
    console.log(`Creating new CNAME for transporteur -> ${newCloudFront}`);
    const newRecord = await ovh.requestPromised('POST', `/domain/zone/${domain}/record`, {
      fieldType: 'CNAME',
      subDomain: 'transporteur',
      target: newCloudFront + '.',
      ttl: 3600
    });
    console.log('Created new record:', newRecord);

    // Refresh zone
    console.log('Refreshing zone...');
    await ovh.requestPromised('POST', `/domain/zone/${domain}/refresh`);
    console.log('Zone refreshed!');

    console.log('\n✅ DNS updated successfully!');
    console.log(`transporteur.${domain} -> ${newCloudFront}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

updateDNS();
