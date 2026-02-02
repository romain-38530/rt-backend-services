const https = require('https');
const crypto = require('crypto');

// OVH API credentials
const OVH_APP_KEY = 'ed9d52f0f9666bcf';
const OVH_APP_SECRET = 'e310afd76f33ae5aa5b92fd0636952f7';
const OVH_CONSUMER_KEY = 'ab3abd0d8ead07b78823e019afa83561';
const OVH_ENDPOINT = 'eu.api.ovh.com';

const DOMAIN = 'symphonia-controltower.com';

// DNS records to add for Amplify
const DNS_RECORDS = [
  {
    fieldType: 'CNAME',
    subDomain: 'transporteur',
    target: 'd3fy85w9zy25oo.cloudfront.net.',
    ttl: 3600
  }
];

function sign(method, url, body, timestamp) {
  const toSign = [OVH_APP_SECRET, OVH_CONSUMER_KEY, method, url, body, timestamp].join('+');
  return '$1$' + crypto.createHash('sha1').update(toSign).digest('hex');
}

async function ovhRequest(method, path, body = null) {
  const url = `https://${OVH_ENDPOINT}/1.0${path}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : '';
  const signature = sign(method, url, bodyStr, timestamp.toString());

  return new Promise((resolve, reject) => {
    const options = {
      hostname: OVH_ENDPOINT,
      path: `/1.0${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Ovh-Application': OVH_APP_KEY,
        'X-Ovh-Consumer': OVH_CONSUMER_KEY,
        'X-Ovh-Timestamp': timestamp.toString(),
        'X-Ovh-Signature': signature
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('CONFIGURATION DNS OVH POUR TRANSPORTEUR');
  console.log('='.repeat(60) + '\n');

  // 1. Verify credentials
  console.log('1. Verification des credentials OVH...');
  const me = await ovhRequest('GET', '/me');
  if (me.status !== 200) {
    console.log('   ERREUR: Credentials invalides');
    console.log('   Response:', me.data);
    return;
  }
  console.log(`   OK - Compte: ${me.data.nichandle}\n`);

  // 2. Check domain
  console.log('2. Verification du domaine...');
  const zones = await ovhRequest('GET', '/domain/zone');
  if (!zones.data.includes(DOMAIN)) {
    console.log(`   ERREUR: Domaine ${DOMAIN} non trouve`);
    console.log('   Domaines disponibles:', zones.data);
    return;
  }
  console.log(`   OK - Domaine ${DOMAIN} trouve\n`);

  // 3. Check existing records
  console.log('3. Verification des enregistrements existants...');
  const existingRecords = await ovhRequest('GET', `/domain/zone/${DOMAIN}/record?subDomain=transporteur`);
  console.log(`   Enregistrements existants pour "transporteur":`, existingRecords.data);

  // 4. Add DNS records
  console.log('\n4. Ajout des enregistrements DNS...');

  for (const record of DNS_RECORDS) {
    console.log(`   ${record.subDomain}.${DOMAIN} ${record.fieldType} ${record.target}`);

    const result = await ovhRequest('POST', `/domain/zone/${DOMAIN}/record`, {
      fieldType: record.fieldType,
      subDomain: record.subDomain,
      target: record.target,
      ttl: record.ttl
    });

    if (result.status === 200 || result.status === 201) {
      console.log(`   -> CREE (ID: ${result.data.id})`);
    } else if (result.status === 409) {
      console.log(`   -> EXISTE DEJA`);
    } else {
      console.log(`   -> ERREUR (${result.status}): ${JSON.stringify(result.data)}`);
    }
  }

  // 5. Refresh zone
  console.log('\n5. Rafraichissement de la zone DNS...');
  const refresh = await ovhRequest('POST', `/domain/zone/${DOMAIN}/refresh`);
  if (refresh.status === 200 || refresh.status === 204) {
    console.log('   Zone rafraichie!\n');
  } else {
    console.log(`   Erreur: ${JSON.stringify(refresh.data)}\n`);
  }

  console.log('='.repeat(60));
  console.log('TERMINE');
  console.log('='.repeat(60));
  console.log('\nPropagation DNS: 5-30 minutes');
  console.log(`\nPour verifier: nslookup transporteur.${DOMAIN}`);
}

main().catch(console.error);
