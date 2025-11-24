# RT Backend Services - Deployed to AWS Elastic Beanstalk

## ✅ Services Déployés

### 1. Authentification (authz)
- **URL:** http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com
- **Status:** Deployed & Tested ✓
- **MongoDB:** rt-auth
- **Features:** Express, MongoDB, CORS, Helmet

### 2. Notifications
- **URL:** http://rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com
- **Status:** Deployed & Tested ✓
- **MongoDB:** rt-notifications
- **Features:** Express, MongoDB, Mailgun, CORS, Helmet

### 3. Geo-Tracking
- **URL:** http://rt-geo-tracking-api-prod.eba-3mi2pcfi.eu-central-1.elasticbeanstalk.com
- **Status:** Deployed & Tested ✓
- **MongoDB:** rt-geotracking
- **Features:** Express, MongoDB, Geospatial (2dsphere), CORS, Helmet

### 4. Orders
- **URL:** http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com
- **Status:** Environment exists
- **MongoDB:** rt-orders

### 5. Planning
- **URL:** http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com
- **Status:** Environment exists
- **MongoDB:** rt-planning

### 6. eCMR
- **URL:** http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com
- **Status:** Environment exists
- **MongoDB:** rt-ecmr

### 7. Palettes
- **URL:** http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com
- **Status:** Environment exists
- **MongoDB:** rt-palettes

## Configuration

- **Region:** eu-central-1 (Frankfurt)
- **Platform:** Node.js 20 on Amazon Linux 2023
- **Instance Type:** t3.micro (single instance)
- **Database:** MongoDB Atlas (stagingrt cluster)

## MongoDB Credentials

```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/{DB_NAME}?retryWrites=true&w=majority&appName=StagingRT
```

## CORS Origins

```
http://localhost:3000
https://main.dbg6okncuyyiw.amplifyapp.com
https://main.d1tb834u144p4r.amplifyapp.com
https://main.d3b6p09ihn5w7r.amplifyapp.com
https://main.dzvo8973zaqb.amplifyapp.com
https://main.d3hz3xvddrl94o.amplifyapp.com
https://main.d31p7m90ewg4xm.amplifyapp.com
```

## Dernière mise à jour
2025-11-23
