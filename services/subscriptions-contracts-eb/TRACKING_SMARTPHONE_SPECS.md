# Spécifications Tracking Smartphone GPS
## SYMPHONI.A - Version Intermédiaire (150€/mois)

**Version**: 1.0.0
**Date**: 2025-11-25
**Conformité**: Page 6 du Cahier des Charges

---

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture Technique](#architecture-technique)
3. [Application Mobile Driver](#application-mobile-driver)
4. [QR Code Pairing](#qr-code-pairing)
5. [GPS Tracking Implementation](#gps-tracking-implementation)
6. [API Endpoints](#api-endpoints)
7. [Backend Services](#backend-services)
8. [Sécurité](#sécurité)
9. [Géofencing Simple](#géofencing-simple)
10. [Carte Temps Réel](#carte-temps-réel)
11. [Plan d'Implémentation](#plan-dimplémentation)

---

## Vue d'ensemble

### Caractéristiques Conformes au Cahier des Charges

La **Version Intermédiaire - GPS Smartphone** offre:

✅ **Appairage QR Code**
- Scan d'un QR code unique par commande
- Association instantanée chauffeur ↔ commande
- Pas de saisie manuelle requise

✅ **Application Mobile Driver**
- React Native (iOS + Android)
- Interface simple et intuitive
- Fonctionnement offline/online

✅ **Tracking GPS 30 secondes**
- Position GPS envoyée toutes les 30 secondes
- Vitesse et cap calculés automatiquement
- Optimisation batterie

✅ **Géofencing Simple**
- Zones de 500m, 1000m, 2000m
- Détection automatique statuts
- Notifications push

✅ **Carte Temps Réel**
- Dashboard web pour suivi
- Mise à jour live des positions
- ETA dynamique

### Tarification
- **150€/mois** par compte transporteur
- Nombre illimité de chauffeurs
- Tracking illimité de commandes

---

## Architecture Technique

```
┌─────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE GLOBALE                      │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐
│  Mobile App      │         │  Web Dashboard   │
│  (React Native)  │         │  (React.js)      │
│                  │         │                  │
│  • QR Scanner    │         │  • Live Map      │
│  • GPS Tracker   │         │  • Status View   │
│  • Push Notifs   │         │  • Analytics     │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         │ HTTPS/WSS                  │ HTTPS/WSS
         │                            │
         ▼                            ▼
┌─────────────────────────────────────────────────────────┐
│              API Gateway (Express.js)                   │
│  • Authentication (JWT)                                 │
│  • Rate Limiting                                        │
│  • WebSocket Server (Socket.io)                        │
└────────┬─────────────────────────────────────┬──────────┘
         │                                     │
         ▼                                     ▼
┌────────────────────┐            ┌────────────────────┐
│ Tracking Service   │            │ Geofencing Service │
│                    │            │                    │
│ • GPS Processing   │            │ • Zone Detection   │
│ • ETA Calculation  │            │ • Auto Status      │
│ • Position Storage │            │ • Notifications    │
└────────┬───────────┘            └────────┬───────────┘
         │                                 │
         └────────────┬────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   MongoDB Database     │
         │                        │
         │ • transport_orders     │
         │ • gps_positions        │
         │ • qr_pairing           │
         │ • tracking_sessions    │
         └────────────────────────┘
```

---

## Application Mobile Driver

### Stack Technique

```javascript
{
  "framework": "React Native 0.72+",
  "language": "TypeScript",
  "stateManagement": "Redux Toolkit",
  "navigation": "React Navigation 6",
  "maps": "react-native-maps",
  "qrCode": "react-native-qrcode-scanner",
  "geolocation": "react-native-geolocation-service",
  "backgroundTracking": "react-native-background-geolocation",
  "pushNotifications": "react-native-push-notification",
  "storage": "AsyncStorage",
  "networking": "axios + socket.io-client"
}
```

### Structure de l'Application

```
symphonia-driver-app/
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── QRScannerScreen.tsx
│   │   ├── ActiveOrderScreen.tsx
│   │   ├── OrderDetailsScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── components/
│   │   ├── MapView.tsx
│   │   ├── StatusButton.tsx
│   │   ├── OrderCard.tsx
│   │   └── GPSIndicator.tsx
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── TrackingService.ts
│   │   ├── GeolocationService.ts
│   │   └── ApiService.ts
│   ├── store/
│   │   ├── slices/
│   │   │   ├── authSlice.ts
│   │   │   ├── orderSlice.ts
│   │   │   └── trackingSlice.ts
│   │   └── store.ts
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   └── utils/
│       ├── constants.ts
│       ├── permissions.ts
│       └── validators.ts
├── android/
├── ios/
└── package.json
```

### Écrans Principaux

#### 1. LoginScreen
```typescript
// src/screens/LoginScreen.tsx

import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet } from 'react-native';
import { useDispatch } from 'react-redux';
import { login } from '../store/slices/authSlice';

export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();

  const handleLogin = async () => {
    try {
      await dispatch(login({ email, password })).unwrap();
      navigation.navigate('Home');
    } catch (error) {
      // Handle error
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />
      <Button title="Se connecter" onPress={handleLogin} />
    </View>
  );
};
```

#### 2. QRScannerScreen
```typescript
// src/screens/QRScannerScreen.tsx

import React from 'react';
import QRCodeScanner from 'react-native-qrcode-scanner';
import { useDispatch } from 'react-redux';
import { pairOrder } from '../store/slices/orderSlice';

export const QRScannerScreen = ({ navigation }) => {
  const dispatch = useDispatch();

  const onScan = async (e) => {
    try {
      // QR Code format: symphonia://order/{orderId}/pair/{pairingToken}
      const data = parseQRCode(e.data);

      await dispatch(pairOrder({
        orderId: data.orderId,
        pairingToken: data.pairingToken
      })).unwrap();

      navigation.navigate('ActiveOrder', { orderId: data.orderId });
    } catch (error) {
      // Handle error
    }
  };

  return (
    <QRCodeScanner
      onRead={onScan}
      topContent={<Text>Scannez le QR code de la commande</Text>}
    />
  );
};

function parseQRCode(qrData: string) {
  // Format: symphonia://order/ORD-251125-1234/pair/abc123def456
  const match = qrData.match(/symphonia:\/\/order\/([^\/]+)\/pair\/([^\/]+)/);
  if (!match) throw new Error('Invalid QR code');

  return {
    orderId: match[1],
    pairingToken: match[2]
  };
}
```

#### 3. ActiveOrderScreen
```typescript
// src/screens/ActiveOrderScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import { startTracking, stopTracking, updateStatus } from '../store/slices/trackingSlice';

export const ActiveOrderScreen = ({ route }) => {
  const { orderId } = route.params;
  const dispatch = useDispatch();
  const order = useSelector(state => state.order.currentOrder);
  const tracking = useSelector(state => state.tracking);

  useEffect(() => {
    // Démarrer le tracking GPS
    dispatch(startTracking(orderId));

    return () => {
      // Arrêter le tracking au démontage
      dispatch(stopTracking());
    };
  }, [orderId]);

  const handleStatusUpdate = (status) => {
    dispatch(updateStatus({ orderId, status }));
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={{
          latitude: tracking.currentPosition?.latitude || 48.8566,
          longitude: tracking.currentPosition?.longitude || 2.3522,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1
        }}
      >
        {/* Position actuelle */}
        {tracking.currentPosition && (
          <Marker
            coordinate={tracking.currentPosition}
            title="Vous êtes ici"
            pinColor="blue"
          />
        )}

        {/* Point de chargement */}
        <Marker
          coordinate={order.pickupCoordinates}
          title="Point de chargement"
          pinColor="green"
        />

        {/* Point de livraison */}
        <Marker
          coordinate={order.deliveryCoordinates}
          title="Point de livraison"
          pinColor="red"
        />

        {/* Itinéraire */}
        {tracking.route && (
          <Polyline
            coordinates={tracking.route}
            strokeColor="#2563eb"
            strokeWidth={3}
          />
        )}
      </MapView>

      <View style={styles.controls}>
        <Text style={styles.orderRef}>{order.reference}</Text>
        <Text>Statut: {order.status}</Text>
        <Text>ETA: {tracking.eta}</Text>

        <View style={styles.buttons}>
          <Button
            title="Arrivé chargement"
            onPress={() => handleStatusUpdate('ARRIVED_PICKUP')}
          />
          <Button
            title="Chargé - En route"
            onPress={() => handleStatusUpdate('LOADED')}
          />
          <Button
            title="Arrivé livraison"
            onPress={() => handleStatusUpdate('ARRIVED_DELIVERY')}
          />
          <Button
            title="Livré"
            onPress={() => handleStatusUpdate('DELIVERED')}
          />
        </View>
      </View>
    </View>
  );
};
```

---

## QR Code Pairing

### Génération QR Code (Backend)

```javascript
// tracking-smartphone-service.js

const QRCode = require('qrcode');
const crypto = require('crypto');

/**
 * Générer un QR code pour pairing
 */
async function generateOrderQRCode(db, orderId) {
  try {
    // Générer un token de pairing unique
    const pairingToken = crypto.randomBytes(32).toString('hex');

    // Stocker le token
    await db.collection('qr_pairing').insertOne({
      orderId: new ObjectId(orderId),
      pairingToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      used: false,
      usedBy: null,
      usedAt: null
    });

    // Format du QR code
    const qrData = `symphonia://order/${orderId}/pair/${pairingToken}`;

    // Générer l'image QR code
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 400,
      margin: 2,
      color: {
        dark: '#2563eb',
        light: '#ffffff'
      }
    });

    return {
      success: true,
      qrCodeDataUrl,
      pairingToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

  } catch (error) {
    console.error('Error generating QR code:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Valider et apparier avec QR code
 */
async function pairOrderWithQRCode(db, orderId, pairingToken, driverId) {
  try {
    // Vérifier le token
    const pairing = await db.collection('qr_pairing').findOne({
      orderId: new ObjectId(orderId),
      pairingToken,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!pairing) {
      return {
        success: false,
        error: 'Invalid or expired pairing token'
      };
    }

    // Marquer comme utilisé
    await db.collection('qr_pairing').updateOne(
      { _id: pairing._id },
      {
        $set: {
          used: true,
          usedBy: driverId,
          usedAt: new Date()
        }
      }
    );

    // Créer la session de tracking
    const trackingSession = {
      orderId: new ObjectId(orderId),
      driverId,
      trackingType: 'SMARTPHONE_GPS',
      startedAt: new Date(),
      active: true,
      lastPosition: null,
      positionsCount: 0
    };

    const result = await db.collection('tracking_sessions').insertOne(trackingSession);

    // Mettre à jour la commande
    await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          assignedDriverId: driverId,
          trackingType: 'SMARTPHONE_GPS',
          trackingSessionId: result.insertedId,
          status: 'TRACKING_STARTED'
        }
      }
    );

    return {
      success: true,
      trackingSessionId: result.insertedId.toString(),
      order: await db.collection('transport_orders').findOne({ _id: new ObjectId(orderId) })
    };

  } catch (error) {
    console.error('Error pairing order:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Format QR Code

```
symphonia://order/{orderId}/pair/{pairingToken}

Exemple:
symphonia://order/ORD-251125-1234/pair/a1b2c3d4e5f6...
```

---

## GPS Tracking Implementation

### Service de Géolocalisation (Mobile)

```typescript
// src/services/GeolocationService.ts

import Geolocation from 'react-native-geolocation-service';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

class GeolocationService {
  private watchId: number | null = null;
  private trackingInterval: number = 30000; // 30 secondes
  private onPositionUpdate: (position: Position) => void;

  constructor(onPositionUpdate: (position: Position) => void) {
    this.onPositionUpdate = onPositionUpdate;
  }

  /**
   * Demander les permissions de localisation
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Permission de localisation',
          message: 'SYMPHONIA a besoin de votre position pour le tracking',
          buttonPositive: 'OK'
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      // iOS
      const auth = await Geolocation.requestAuthorization('whenInUse');
      return auth === 'granted';
    }
  }

  /**
   * Démarrer le tracking GPS
   */
  async startTracking() {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Location permission denied');
    }

    // Configuration du tracking en arrière-plan
    await BackgroundGeolocation.ready({
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 50, // mètres
      stopTimeout: 5, // minutes
      debug: false,
      logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
      stopOnTerminate: false,
      startOnBoot: true,
      locationUpdateInterval: this.trackingInterval,
      fastestLocationUpdateInterval: this.trackingInterval,

      // Configuration Android
      foregroundService: true,
      notification: {
        title: 'SYMPHONIA Tracking',
        text: 'Tracking actif pour votre livraison'
      }
    });

    // Écouter les mises à jour de position
    BackgroundGeolocation.onLocation(
      (location) => {
        this.handlePositionUpdate(location);
      },
      (error) => {
        console.error('Location error:', error);
      }
    );

    // Démarrer
    await BackgroundGeolocation.start();
  }

  /**
   * Arrêter le tracking GPS
   */
  async stopTracking() {
    await BackgroundGeolocation.stop();

    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Gérer une mise à jour de position
   */
  private handlePositionUpdate(location: any) {
    const position: Position = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude || 0,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed || 0,
      heading: location.coords.heading || 0,
      timestamp: new Date(location.timestamp)
    };

    this.onPositionUpdate(position);
  }

  /**
   * Obtenir la position actuelle
   */
  async getCurrentPosition(): Promise<Position> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude || 0,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed || 0,
            heading: position.coords.heading || 0,
            timestamp: new Date(position.timestamp)
          });
        },
        (error) => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000
        }
      );
    });
  }
}

export default GeolocationService;
```

### Redux Slice pour le Tracking

```typescript
// src/store/slices/trackingSlice.ts

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import GeolocationService from '../../services/GeolocationService';
import ApiService from '../../services/ApiService';

interface TrackingState {
  isTracking: boolean;
  currentPosition: Position | null;
  route: Position[];
  eta: string | null;
  orderId: string | null;
  error: string | null;
}

const initialState: TrackingState = {
  isTracking: false,
  currentPosition: null,
  route: [],
  eta: null,
  orderId: null,
  error: null
};

// Service de géolocalisation
let geoService: GeolocationService | null = null;

/**
 * Démarrer le tracking
 */
export const startTracking = createAsyncThunk(
  'tracking/start',
  async (orderId: string, { dispatch }) => {
    geoService = new GeolocationService((position) => {
      dispatch(positionUpdated(position));

      // Envoyer au serveur
      ApiService.sendGPSPosition(orderId, position);
    });

    await geoService.startTracking();

    return { orderId };
  }
);

/**
 * Arrêter le tracking
 */
export const stopTracking = createAsyncThunk(
  'tracking/stop',
  async () => {
    if (geoService) {
      await geoService.stopTracking();
      geoService = null;
    }
  }
);

/**
 * Mettre à jour le statut
 */
export const updateStatus = createAsyncThunk(
  'tracking/updateStatus',
  async ({ orderId, status }: { orderId: string; status: string }) => {
    const result = await ApiService.updateOrderStatus(orderId, status);
    return result;
  }
);

const trackingSlice = createSlice({
  name: 'tracking',
  initialState,
  reducers: {
    positionUpdated: (state, action) => {
      state.currentPosition = action.payload;
      state.route.push(action.payload);
    },
    etaUpdated: (state, action) => {
      state.eta = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(startTracking.fulfilled, (state, action) => {
        state.isTracking = true;
        state.orderId = action.payload.orderId;
        state.error = null;
      })
      .addCase(startTracking.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to start tracking';
      })
      .addCase(stopTracking.fulfilled, (state) => {
        state.isTracking = false;
        state.orderId = null;
      });
  }
});

export const { positionUpdated, etaUpdated } = trackingSlice.actions;
export default trackingSlice.reducer;
```

---

## API Endpoints

### Backend Routes

```javascript
// tracking-smartphone-routes.js

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const trackingService = require('./tracking-smartphone-service');
const geofencingService = require('./geofencing-service');

/**
 * POST /api/tracking/smartphone/qr-code/:orderId
 * Générer un QR code de pairing
 */
router.post('/qr-code/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const db = req.app.locals.db;

    const result = await trackingService.generateOrderQRCode(db, orderId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tracking/smartphone/pair
 * Apparier une commande avec un chauffeur
 */
router.post('/pair', async (req, res) => {
  try {
    const { orderId, pairingToken, driverId } = req.body;
    const db = req.app.locals.db;

    const result = await trackingService.pairOrderWithQRCode(
      db,
      orderId,
      pairingToken,
      driverId
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tracking/smartphone/position
 * Envoyer une position GPS
 */
router.post('/position', async (req, res) => {
  try {
    const {
      orderId,
      latitude,
      longitude,
      altitude,
      accuracy,
      speed,
      heading,
      timestamp
    } = req.body;

    const db = req.app.locals.db;

    // Stocker la position
    const position = {
      orderId: new ObjectId(orderId),
      latitude,
      longitude,
      altitude,
      accuracy,
      speed,
      heading,
      timestamp: new Date(timestamp),
      receivedAt: new Date()
    };

    await db.collection('gps_positions').insertOne(position);

    // Mettre à jour la session de tracking
    await db.collection('tracking_sessions').updateOne(
      { orderId: new ObjectId(orderId), active: true },
      {
        $set: {
          lastPosition: position,
          lastUpdate: new Date()
        },
        $inc: {
          positionsCount: 1
        }
      }
    );

    // Vérifier le géofencing
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (order) {
      const geofenceResult = await geofencingService.checkGeofencing(
        db,
        orderId,
        { lat: latitude, lng: longitude },
        order.pickupAddress.coordinates,
        order.deliveryAddress.coordinates
      );

      res.json({
        success: true,
        position,
        geofence: geofenceResult
      });
    } else {
      res.json({
        success: true,
        position
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tracking/smartphone/session/:orderId
 * Obtenir la session de tracking active
 */
router.get('/session/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const db = req.app.locals.db;

    const session = await db.collection('tracking_sessions').findOne({
      orderId: new ObjectId(orderId),
      active: true
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No active tracking session found'
      });
    }

    // Récupérer les dernières positions
    const positions = await db.collection('gps_positions')
      .find({ orderId: new ObjectId(orderId) })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    res.json({
      success: true,
      session,
      positions,
      positionsCount: positions.length
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tracking/smartphone/status
 * Mettre à jour le statut de la commande
 */
router.post('/status', async (req, res) => {
  try {
    const { orderId, status, position } = req.body;
    const db = req.app.locals.db;

    // Mapper les statuts de l'app mobile vers les statuts système
    const statusMapping = {
      'ARRIVED_PICKUP': 'ARRIVED_PICKUP',
      'LOADED': 'LOADED',
      'ARRIVED_DELIVERY': 'ARRIVED_DELIVERY',
      'DELIVERED': 'DELIVERED'
    };

    const systemStatus = statusMapping[status];
    if (!systemStatus) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    // Mettre à jour la commande
    await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          status: systemStatus,
          updatedAt: new Date()
        }
      }
    );

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: `order.${status.toLowerCase()}`,
      timestamp: new Date(),
      data: {
        status: systemStatus,
        position,
        method: 'SMARTPHONE_APP'
      },
      metadata: {
        source: 'TRACKING_SMARTPHONE'
      }
    });

    res.json({
      success: true,
      status: systemStatus
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

---

## Backend Services

### tracking-smartphone-service.js

Voir section "QR Code Pairing" ci-dessus pour les fonctions principales.

Collections MongoDB nécessaires:

```javascript
// Collection: tracking_sessions
{
  _id: ObjectId,
  orderId: ObjectId,
  driverId: String,
  trackingType: "SMARTPHONE_GPS",
  startedAt: Date,
  endedAt: Date,
  active: Boolean,
  lastPosition: {
    latitude: Number,
    longitude: Number,
    timestamp: Date
  },
  positionsCount: Number
}

// Collection: gps_positions
{
  _id: ObjectId,
  orderId: ObjectId,
  latitude: Number,
  longitude: Number,
  altitude: Number,
  accuracy: Number,
  speed: Number,
  heading: Number,
  timestamp: Date,
  receivedAt: Date
}

// Collection: qr_pairing
{
  _id: ObjectId,
  orderId: ObjectId,
  pairingToken: String,
  createdAt: Date,
  expiresAt: Date,
  used: Boolean,
  usedBy: String,
  usedAt: Date
}
```

---

## Sécurité

### 1. Authentication JWT

```typescript
// src/services/AuthService.ts

class AuthService {
  private apiUrl: string;

  async login(email: string, password: string) {
    const response = await fetch(`${this.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (data.success) {
      // Stocker le token JWT
      await AsyncStorage.setItem('jwt_token', data.token);
      await AsyncStorage.setItem('user_id', data.userId);

      return data;
    } else {
      throw new Error(data.error);
    }
  }

  async getToken() {
    return await AsyncStorage.getItem('jwt_token');
  }

  async logout() {
    await AsyncStorage.removeItem('jwt_token');
    await AsyncStorage.removeItem('user_id');
  }
}
```

### 2. Sécurisation API

```javascript
// Backend middleware

const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid token'
      });
    }

    req.user = user;
    next();
  });
}

// Appliquer sur toutes les routes tracking
router.use(authenticateToken);
```

### 3. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const positionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 3, // max 3 positions par minute (toutes les 30 sec)
  message: 'Too many position updates'
});

router.post('/position', positionLimiter, async (req, res) => {
  // ...
});
```

---

## Géofencing Simple

Réutilisation du service existant:

```javascript
// geofencing-service.js (déjà implémenté)

/**
 * Zones de géofencing:
 * - 500m: ARRIVED
 * - 1000m: NEARBY
 * - 2000m: APPROACHING
 */

async function checkGeofencing(db, orderId, currentPos, pickupPos, deliveryPos) {
  // Logique déjà implémentée dans geofencing-service.js
  // Détection automatique des statuts
}
```

---

## Carte Temps Réel

### Dashboard Web (React.js)

```jsx
// LiveTrackingMap.jsx

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import io from 'socket.io-client';

export const LiveTrackingMap = ({ orderId }) => {
  const [positions, setPositions] = useState([]);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    // Charger les données initiales
    fetchOrderData(orderId);

    // Connexion WebSocket pour mises à jour temps réel
    const socket = io(process.env.REACT_APP_API_URL);

    socket.on('connect', () => {
      socket.emit('subscribe', { orderId });
    });

    socket.on('position_update', (data) => {
      setCurrentPosition(data.position);
      setPositions(prev => [...prev, data.position]);
    });

    socket.on('status_update', (data) => {
      // Mettre à jour le statut de la commande
    });

    return () => {
      socket.disconnect();
    };
  }, [orderId]);

  const fetchOrderData = async (orderId) => {
    const response = await fetch(`/api/transport-orders/${orderId}`);
    const data = await response.json();
    setOrder(data.order);
  };

  if (!order) return <div>Chargement...</div>;

  return (
    <MapContainer
      center={[48.8566, 2.3522]}
      zoom={10}
      style={{ height: '600px', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {/* Position actuelle du chauffeur */}
      {currentPosition && (
        <Marker position={[currentPosition.latitude, currentPosition.longitude]}>
          <Popup>
            Position actuelle<br />
            Vitesse: {currentPosition.speed} km/h<br />
            {new Date(currentPosition.timestamp).toLocaleTimeString()}
          </Popup>
        </Marker>
      )}

      {/* Point de chargement */}
      <Marker position={[order.pickupAddress.coordinates.lat, order.pickupAddress.coordinates.lng]}>
        <Popup>Point de chargement</Popup>
      </Marker>

      {/* Point de livraison */}
      <Marker position={[order.deliveryAddress.coordinates.lat, order.deliveryAddress.coordinates.lng]}>
        <Popup>Point de livraison</Popup>
      </Marker>

      {/* Trajet parcouru */}
      {positions.length > 1 && (
        <Polyline
          positions={positions.map(p => [p.latitude, p.longitude])}
          color="blue"
          weight={3}
        />
      )}
    </MapContainer>
  );
};
```

### WebSocket Server (Backend)

```javascript
// websocket-server.js

const socketIO = require('socket.io');

function setupWebSocket(server, mongoClient) {
  const io = socketIO(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('subscribe', async ({ orderId }) => {
      // Rejoindre la room de la commande
      socket.join(`order_${orderId}`);

      console.log(`Client ${socket.id} subscribed to order ${orderId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}

// Dans le service tracking, émettre les mises à jour
function broadcastPositionUpdate(io, orderId, position) {
  io.to(`order_${orderId}`).emit('position_update', {
    orderId,
    position,
    timestamp: new Date()
  });
}

module.exports = { setupWebSocket, broadcastPositionUpdate };
```

---

## Plan d'Implémentation

### Phase 1: Backend (Semaine 1-2)

**Jours 1-3: Services Backend**
- [ ] Créer `tracking-smartphone-service.js`
- [ ] Implémenter génération QR codes
- [ ] Implémenter système de pairing
- [ ] Créer collections MongoDB

**Jours 4-5: API Routes**
- [ ] Créer `tracking-smartphone-routes.js`
- [ ] Implémenter endpoints pairing
- [ ] Implémenter endpoints positions GPS
- [ ] Implémenter endpoints statuts

**Jours 6-7: WebSocket**
- [ ] Setup Socket.io server
- [ ] Implémenter broadcasting temps réel
- [ ] Tests de charge

### Phase 2: Application Mobile (Semaine 3-5)

**Semaine 3: Setup & Navigation**
- [ ] Initialiser projet React Native
- [ ] Setup Redux + TypeScript
- [ ] Configurer React Navigation
- [ ] Créer écrans de base

**Semaine 4: Fonctionnalités Core**
- [ ] Implémenter QR scanner
- [ ] Implémenter service de géolocalisation
- [ ] Implémenter tracking GPS background
- [ ] Intégration API

**Semaine 5: UI/UX & Tests**
- [ ] Implémenter carte avec react-native-maps
- [ ] Design interface chauffeur
- [ ] Tests iOS & Android
- [ ] Optimisations batterie

### Phase 3: Dashboard Web (Semaine 6)

**Jours 1-3: Interface**
- [ ] Créer composant carte Leaflet
- [ ] Intégrer WebSocket client
- [ ] Affichage temps réel positions

**Jours 4-5: Analytics**
- [ ] Historique trajets
- [ ] Statistiques chauffeur
- [ ] Export rapports

### Phase 4: Tests & Déploiement (Semaine 7-8)

**Tests**
- [ ] Tests unitaires backend
- [ ] Tests E2E mobile
- [ ] Tests de charge API
- [ ] Tests battery drain mobile

**Déploiement**
- [ ] Déploiement backend (AWS EB)
- [ ] Publication app iOS (TestFlight)
- [ ] Publication app Android (Play Store Beta)
- [ ] Documentation utilisateur

---

## Configuration Environnement

### Backend (.env)

```bash
# MongoDB
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=your_secret_key_here

# WebSocket
ALLOWED_ORIGINS=https://app.symphonia.fr,https://dashboard.symphonia.fr

# Tracking
TRACKING_INTERVAL_MS=30000
GPS_ACCURACY_THRESHOLD=50

# QR Code
QR_TOKEN_EXPIRATION_HOURS=24
```

### Mobile (.env)

```bash
# API
API_BASE_URL=https://api.symphonia.fr
WS_URL=wss://api.symphonia.fr

# Tracking
GPS_UPDATE_INTERVAL=30000
GPS_DISTANCE_FILTER=50
ENABLE_BACKGROUND_TRACKING=true

# Maps
GOOGLE_MAPS_API_KEY=your_key_here
```

---

## Coûts d'Implémentation

### Développement
- Backend: 5 jours × 500€ = **2 500€**
- Mobile App: 15 jours × 500€ = **7 500€**
- Dashboard Web: 5 jours × 500€ = **2 500€**
- Tests & Deploy: 5 jours × 500€ = **2 500€**

**Total développement: 15 000€**

### Infrastructure (mensuel)
- MongoDB Atlas (M10): **50€/mois**
- AWS Elastic Beanstalk: **30€/mois**
- WebSocket server: **20€/mois**
- App stores (compte dev): **100€/an**

**Total infrastructure: ~100€/mois**

### ROI
- Prix facturé: **150€/mois** par transporteur
- Break-even: 100 clients = 15 000€ MRR
- Marge nette: 140€/mois par client

---

## Support & Maintenance

### Documentation
- Guide utilisateur chauffeur
- Guide d'intégration transporteur
- API documentation

### Monitoring
- Positions GPS reçues/minute
- Taux de réussite pairing
- Batterie moyenne consommée
- Précision GPS moyenne

### Améliorations futures
- Mode offline complet
- Synchronisation différée
- Optimisation batterie avancée
- Support multi-langues

---

**Version**: 1.0.0
**Date**: 2025-11-25
**Auteur**: RT Backend Services - SYMPHONI.A Suite
