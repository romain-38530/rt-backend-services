/**
 * Storage Market Routes - TEST: Simple models without Schemas
 */

const express = require('express');
const {
  StorageTypes,
  VolumeUnits,
  PublicationStatus,
  PublicationTypes,
  DefaultConfig
} = require('./storage-market-models-simple');

function configureStorageMarketRoutes(app, db, authenticateToken) {
  console.log('[Storage Market] Routes TEST with simple models configurées');

  // Route de test ultra-simple
  app.get('/api/storage-market/test', (req, res) => {
    res.json({
      success: true,
      message: 'Storage Market with SIMPLE models works!'
    });
  });

  // Route constants (pas de async, pas de db)
  app.get('/api/storage-market/constants', (req, res) => {
    res.json({
      success: true,
      data: {
        storageTypes: StorageTypes,
        volumeUnits: VolumeUnits,
        publicationStatus: PublicationStatus,
        publicationTypes: PublicationTypes,
        defaultConfig: DefaultConfig
      }
    });
  });
}

module.exports = { configureStorageMarketRoutes };
