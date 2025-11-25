// Transport Orders Routes - SYMPHONI.A Transport Order Management
// RT Backend Services - Version 1.0.0

const express = require('express');
const { ObjectId } = require('mongodb');
const {
  OrderStatus,
  EventTypes,
  TrackingTypes,
  CreationChannels,
  TransportConstraints,
  IncidentTypes,
  ScoringCriteria,
  calculateCarrierScore,
  getNextStatus,
  validateOrder,
  generateOrderReference,
  calculateETA,
  calculateDistance
} = require('./transport-orders-models');

const tomtom = require('./tomtom-integration');
const geofencing = require('./geofencing-service');
const laneMatching = require('./lane-matching-service');

/**
 * Create transport orders router
 */
function createTransportOrdersRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Middleware to check MongoDB connection
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: 'Database connection not available'
      });
    }
    next();
  };

  // Get database
  const getDb = () => mongoClient.db('rt-subscriptions-contracts');

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Create an event
   */
  async function createEvent(db, orderId, eventType, data = {}, metadata = {}) {
    const event = {
      orderId: new ObjectId(orderId),
      eventType,
      timestamp: new Date(),
      data,
      metadata: {
        source: metadata.source || 'API',
        ...metadata
      }
    };

    await db.collection('transport_events').insertOne(event);
    return event;
  }

  /**
   * Update order status
   */
  async function updateOrderStatus(db, orderId, status, eventType, eventData = {}) {
    const result = await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          status,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      throw new Error('Order not found');
    }

    // Create event
    await createEvent(db, orderId, eventType, eventData);

    return result;
  }

  // ==================== 1. ORDER CREATION ====================

  /**
   * POST /api/transport-orders
   * Create a new transport order
   */
  router.post('/', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const orderData = req.body;

      // Generate reference if not provided
      if (!orderData.reference) {
        orderData.reference = generateOrderReference('ORD');
      }

      // Set creation metadata
      orderData.creationChannel = orderData.creationChannel || CreationChannels.ERP_API;
      orderData.status = OrderStatus.NEW;
      orderData.createdAt = new Date();
      orderData.updatedAt = new Date();
      orderData.closedAt = null;

      // Validate order
      const validation = validateOrder(orderData);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validation.errors
        });
      }

      // Insert order
      const result = await db.collection('transport_orders').insertOne(orderData);
      const orderId = result.insertedId;

      // Create initial event
      await createEvent(db, orderId, EventTypes.ORDER_CREATED, {
        reference: orderData.reference,
        industrialId: orderData.industrialId,
        creationChannel: orderData.creationChannel
      });

      // Update status to AWAITING_ASSIGNMENT
      await updateOrderStatus(
        db,
        orderId,
        OrderStatus.AWAITING_ASSIGNMENT,
        EventTypes.ORDER_CREATED,
        { automatic: true }
      );

      // Fetch created order
      const order = await db.collection('transport_orders').findOne({ _id: orderId });

      res.status(201).json({
        success: true,
        data: {
          _id: order._id,
          reference: order.reference,
          status: order.status,
          createdAt: order.createdAt
        }
      });

    } catch (error) {
      console.error('Error creating transport order:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 2. LANE MATCHING ====================

  /**
   * POST /api/transport-orders/:orderId/lane-match
   * Trigger lane matching AI
   */
  router.post('/:orderId/lane-match', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // TODO: Implement actual AI lane matching
      // For now, generate a basic lane ID based on pickup/delivery cities
      const laneId = `LANE-${order.pickupAddress.city.toUpperCase()}-${order.deliveryAddress.city.toUpperCase()}`;

      // Simulate confidence score
      const confidence = 0.85 + Math.random() * 0.1;

      // Update order with lane information
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            laneId,
            laneConfidence: confidence,
            updatedAt: new Date()
          }
        }
      );

      // Create event
      await createEvent(db, orderId, EventTypes.LANE_DETECTED, {
        laneId,
        confidence
      });

      res.json({
        success: true,
        data: {
          laneId,
          confidence,
          historicalData: {
            averagePrice: 450,
            averageDuration: '6h30',
            topCarriers: []
          }
        }
      });

    } catch (error) {
      console.error('Error in lane matching:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 3. DISPATCH CHAIN ====================

  /**
   * POST /api/transport-orders/:orderId/generate-dispatch
   * Generate dispatch chain
   */
  router.post('/:orderId/generate-dispatch', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { carrierIds = [] } = req.body;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Generate dispatch chain
      const dispatchChain = carrierIds.map((carrierId, index) => ({
        carrierId,
        order: index + 1,
        status: 'pending',
        checksPassed: {
          vigilance: true, // TODO: Implement actual checks
          availability: true,
          scoring: true,
          pricingGrid: true
        }
      }));

      // Add Affret.IA as fallback
      dispatchChain.push({
        carrierId: 'AFFRETIA',
        order: dispatchChain.length + 1,
        status: 'pending',
        checksPassed: {
          vigilance: true,
          availability: true,
          scoring: true,
          pricingGrid: true
        }
      });

      // Update order
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            dispatchChain,
            updatedAt: new Date()
          }
        }
      );

      // Create event
      await createEvent(db, orderId, EventTypes.DISPATCH_CHAIN_GENERATED, {
        chainLength: dispatchChain.length,
        carriers: dispatchChain.map(c => c.carrierId)
      });

      res.json({
        success: true,
        data: { dispatchChain }
      });

    } catch (error) {
      console.error('Error generating dispatch chain:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/send-to-carrier
   * Send order to next carrier in chain
   */
  router.post('/:orderId/send-to-carrier', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Find next pending carrier in chain
      const nextCarrier = order.dispatchChain?.find(c => c.status === 'pending');

      if (!nextCarrier) {
        return res.status(400).json({
          success: false,
          error: 'No more carriers in dispatch chain'
        });
      }

      // Update carrier status to 'sent'
      const updatedChain = order.dispatchChain.map(c =>
        c.carrierId === nextCarrier.carrierId
          ? { ...c, status: 'sent', sentAt: new Date() }
          : c
      );

      // Update order
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            dispatchChain: updatedChain,
            currentCarrierId: nextCarrier.carrierId,
            status: OrderStatus.SENT_TO_CARRIER,
            updatedAt: new Date()
          }
        }
      );

      // Create event
      await createEvent(db, orderId, EventTypes.ORDER_SENT_TO_CARRIER, {
        carrierId: nextCarrier.carrierId,
        orderInChain: nextCarrier.order
      });

      // TODO: Send actual notification (email, SMS, portal)

      res.json({
        success: true,
        data: {
          carrierId: nextCarrier.carrierId,
          sentAt: new Date(),
          timeout: '2 hours'
        }
      });

    } catch (error) {
      console.error('Error sending to carrier:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 4. CARRIER RESPONSE ====================

  /**
   * POST /api/transport-orders/:orderId/carrier-response
   * Record carrier response (accept/refuse)
   */
  router.post('/:orderId/carrier-response', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { carrierId, response, reason } = req.body;

      if (!['accepted', 'refused'].includes(response)) {
        return res.status(400).json({
          success: false,
          error: 'Response must be "accepted" or "refused"'
        });
      }

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Update carrier status in chain
      const updatedChain = order.dispatchChain.map(c =>
        c.carrierId === carrierId
          ? { ...c, status: response, responseAt: new Date(), reason }
          : c
      );

      if (response === 'accepted') {
        // Carrier accepted
        await db.collection('transport_orders').updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              dispatchChain: updatedChain,
              assignedCarrierId: carrierId,
              status: OrderStatus.ACCEPTED,
              updatedAt: new Date()
            }
          }
        );

        await createEvent(db, orderId, EventTypes.CARRIER_ACCEPTED, {
          carrierId,
          responseAt: new Date()
        });

        res.json({
          success: true,
          data: {
            status: 'accepted',
            assignedCarrier: carrierId
          }
        });

      } else {
        // Carrier refused - update chain and move to next
        await db.collection('transport_orders').updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              dispatchChain: updatedChain,
              status: OrderStatus.AWAITING_ASSIGNMENT,
              updatedAt: new Date()
            }
          }
        );

        await createEvent(db, orderId, EventTypes.CARRIER_REFUSED, {
          carrierId,
          reason,
          responseAt: new Date()
        });

        res.json({
          success: true,
          data: {
            status: 'refused',
            reason,
            nextAction: 'Send to next carrier in chain'
          }
        });
      }

    } catch (error) {
      console.error('Error recording carrier response:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 5. AFFRET.IA ESCALATION ====================

  /**
   * POST /api/transport-orders/:orderId/escalate-affretia
   * Escalate order to Affret.IA network
   */
  router.post('/:orderId/escalate-affretia', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Update order status
      await updateOrderStatus(
        db,
        orderId,
        OrderStatus.ESCALATED_TO_AFFRETIA,
        EventTypes.ESCALATED_TO_AFFRETIA,
        {
          network: 'Affret.IA',
          carrierCount: 40000
        }
      );

      // TODO: Implement actual Affret.IA API integration

      res.json({
        success: true,
        data: {
          status: 'escalated',
          network: 'Affret.IA',
          estimatedResponseTime: '30 minutes'
        }
      });

    } catch (error) {
      console.error('Error escalating to Affret.IA:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 6. TRACKING ====================

  /**
   * POST /api/transport-orders/:orderId/start-tracking
   * Start tracking for an order
   */
  router.post('/:orderId/start-tracking', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { trackingType, driverContact, vehicleInfo } = req.body;

      if (!['BASIC', 'INTERMEDIATE', 'PREMIUM'].includes(trackingType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid tracking type. Must be BASIC, INTERMEDIATE, or PREMIUM'
        });
      }

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Update order with tracking info
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            trackingType,
            trackingStartedAt: new Date(),
            driverContact,
            vehicleInfo,
            status: OrderStatus.TRACKING_STARTED,
            updatedAt: new Date()
          }
        }
      );

      // Create event
      await createEvent(db, orderId, EventTypes.TRACKING_STARTED, {
        trackingType,
        driverContact
      });

      res.json({
        success: true,
        data: {
          trackingType,
          trackingStartedAt: new Date(),
          features: TrackingTypes[`${trackingType}_${trackingType === 'BASIC' ? 'EMAIL' : trackingType === 'INTERMEDIATE' ? 'GPS' : 'TOMTOM'}`]?.features || []
        }
      });

    } catch (error) {
      console.error('Error starting tracking:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/update-position
   * Update GPS position
   */
  router.post('/:orderId/update-position', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { lat, lng, speed, heading, timestamp } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const position = {
        lat,
        lng,
        speed: speed || null,
        heading: heading || null,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      };

      // Calculate ETA based on tracking type
      let eta, etaData;
      if (order.trackingType === 'PREMIUM') {
        // Use TomTom for Premium tracking
        etaData = await tomtom.calculateETA(
          position,
          order.deliveryAddress.coordinates,
          {
            vehicleWeight: order.weight,
            averageSpeed: speed || 70
          }
        );
        eta = etaData.eta;

        // Check for delays
        const delayDetection = await tomtom.detectDelay(order, position);
        if (delayDetection.hasDelay && delayDetection.delayMinutes > 15) {
          // Create delay event
          await createEvent(db, orderId, EventTypes.TRACKING_DELAY_DETECTED, {
            delayMinutes: delayDetection.delayMinutes,
            estimatedArrival: delayDetection.estimatedArrival,
            recommendation: delayDetection.recommendation
          });
        }
      } else {
        // Use simple calculation for Basic/Intermediate
        eta = calculateETA(
          position,
          order.deliveryAddress.coordinates,
          position
        );
        etaData = { eta, method: 'haversine' };
      }

      // Update order
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            currentPosition: position,
            eta,
            etaData,
            updatedAt: new Date()
          }
        }
      );

      // Store position in tracking history
      await db.collection('tracking_positions').insertOne({
        orderId: new ObjectId(orderId),
        position,
        eta,
        etaData,
        createdAt: new Date()
      });

      // ========== GEOFENCING AUTOMATIC DETECTION ==========
      let geofenceDetections = [];

      if (order.trackingType === 'PREMIUM' || order.trackingType === 'INTERMEDIATE') {
        // Detect status based on geofencing
        const geofenceResult = await geofencing.detectStatus(order, position);

        if (geofenceResult.success && geofenceResult.detections.length > 0) {
          geofenceDetections = geofenceResult.detections;

          // Process each detection
          for (const detection of geofenceResult.detections) {
            // Create event
            await createEvent(db, orderId, detection.event, {
              automatic: detection.automatic,
              confidence: detection.confidence,
              distance: detection.distance,
              message: detection.message
            });

            // Update order status if high confidence
            if (detection.confidence === 'high') {
              await db.collection('transport_orders').updateOne(
                { _id: new ObjectId(orderId) },
                {
                  $set: {
                    status: OrderStatus[detection.status],
                    updatedAt: new Date()
                  }
                }
              );
            }

            // Notification for important statuses
            if (geofencing.shouldNotify(detection, order)) {
              // TODO: Send notification (email/SMS/push)
              console.log(`[NOTIFICATION] ${detection.message}`);
            }
          }
        }

        // Get recent positions for loading/unloading detection
        const recentPositions = await db.collection('tracking_positions')
          .find({ orderId: new ObjectId(orderId) })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();

        // Detect loading/unloading
        const loadingDetection = geofencing.detectLoadingUnloading(order, recentPositions);

        if (loadingDetection.loading) {
          await createEvent(db, orderId, EventTypes.LOADING, {
            automatic: true,
            stationaryDuration: loadingDetection.stationaryDuration
          });
        }

        if (loadingDetection.unloading) {
          await createEvent(db, orderId, EventTypes.UNLOADING, {
            automatic: true,
            stationaryDuration: loadingDetection.stationaryDuration
          });
        }

        // Detect unexpected stops
        const unexpectedStop = geofencing.detectUnexpectedStop(order, position, recentPositions);

        if (unexpectedStop.unexpectedStop) {
          await createEvent(db, orderId, EventTypes.INCIDENT_REPORTED, {
            type: 'UNEXPECTED_STOP',
            duration: unexpectedStop.duration,
            location: unexpectedStop.location,
            severity: unexpectedStop.severity,
            automatic: true
          });
        }
      }

      res.json({
        success: true,
        data: {
          position,
          eta,
          etaMethod: etaData.method,
          distance: etaData.distance,
          duration: etaData.duration,
          trafficDelay: etaData.trafficDelay || null,
          geofencing: {
            detections: geofenceDetections,
            autoDetection: order.trackingType === 'PREMIUM' || order.trackingType === 'INTERMEDIATE'
          }
        }
      });

    } catch (error) {
      console.error('Error updating position:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/transport-orders/:orderId/tracking
   * Get real-time tracking status
   */
  router.get('/:orderId/tracking', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Get recent positions
      const recentPositions = await db.collection('tracking_positions')
        .find({ orderId: new ObjectId(orderId) })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      res.json({
        success: true,
        data: {
          trackingType: order.trackingType,
          currentPosition: order.currentPosition,
          eta: order.eta,
          status: order.status,
          recentPositions
        }
      });

    } catch (error) {
      console.error('Error getting tracking status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 7. RENDEZ-VOUS (RDV) ====================

  /**
   * POST /api/transport-orders/:orderId/rdv/request
   * Request an appointment
   */
  router.post('/:orderId/rdv/request', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { type, proposedSlot, requestedBy } = req.body; // type: 'pickup' or 'delivery'

      const rdv = {
        orderId: new ObjectId(orderId),
        type, // pickup or delivery
        status: 'requested',
        proposedSlot,
        requestedBy,
        requestedAt: new Date()
      };

      await db.collection('rdv_history').insertOne(rdv);

      await createEvent(db, orderId, EventTypes.RDV_REQUESTED, {
        type,
        proposedSlot
      });

      res.json({
        success: true,
        data: rdv
      });

    } catch (error) {
      console.error('Error requesting RDV:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/rdv/propose
   * Propose an appointment slot
   */
  router.post('/:orderId/rdv/propose', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { type, proposedSlot, proposedBy } = req.body;

      const rdv = {
        orderId: new ObjectId(orderId),
        type,
        status: 'proposed',
        proposedSlot,
        proposedBy,
        proposedAt: new Date()
      };

      await db.collection('rdv_history').insertOne(rdv);

      await createEvent(db, orderId, EventTypes.RDV_PROPOSED, {
        type,
        proposedSlot
      });

      res.json({
        success: true,
        data: rdv
      });

    } catch (error) {
      console.error('Error proposing RDV:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/rdv/confirm
   * Confirm an appointment
   */
  router.post('/:orderId/rdv/confirm', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { type, confirmedSlot, confirmedBy } = req.body;

      const rdv = {
        orderId: new ObjectId(orderId),
        type,
        status: 'confirmed',
        confirmedSlot,
        confirmedBy,
        confirmedAt: new Date()
      };

      await db.collection('rdv_history').insertOne(rdv);

      // Update order
      const updateField = type === 'pickup' ? 'confirmedPickupRdv' : 'confirmedDeliveryRdv';
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            [updateField]: confirmedSlot,
            updatedAt: new Date()
          }
        }
      );

      await createEvent(db, orderId, EventTypes.RDV_CONFIRMED, {
        type,
        confirmedSlot
      });

      res.json({
        success: true,
        data: rdv
      });

    } catch (error) {
      console.error('Error confirming RDV:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 8. TRANSPORT STATUS UPDATES ====================

  /**
   * POST /api/transport-orders/:orderId/status/arrived-pickup
   * Mark arrived at pickup location
   */
  router.post('/:orderId/status/arrived-pickup', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { location, timestamp } = req.body;

      await updateOrderStatus(
        db,
        orderId,
        OrderStatus.ARRIVED_PICKUP,
        EventTypes.ARRIVED_PICKUP,
        { location, timestamp: timestamp || new Date() }
      );

      res.json({
        success: true,
        data: {
          status: OrderStatus.ARRIVED_PICKUP,
          timestamp: timestamp || new Date()
        }
      });

    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/status/loaded
   * Mark loading completed
   */
  router.post('/:orderId/status/loaded', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { timestamp, loadingDuration } = req.body;

      await updateOrderStatus(
        db,
        orderId,
        OrderStatus.LOADED,
        EventTypes.LOADED,
        { timestamp: timestamp || new Date(), loadingDuration }
      );

      res.json({
        success: true,
        data: {
          status: OrderStatus.LOADED,
          timestamp: timestamp || new Date()
        }
      });

    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/status/departed-pickup
   * Mark departed from pickup
   */
  router.post('/:orderId/status/departed-pickup', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { timestamp } = req.body;

      await updateOrderStatus(
        db,
        orderId,
        OrderStatus.EN_ROUTE_DELIVERY,
        EventTypes.DEPARTED_PICKUP,
        { timestamp: timestamp || new Date() }
      );

      res.json({
        success: true,
        data: {
          status: OrderStatus.EN_ROUTE_DELIVERY,
          timestamp: timestamp || new Date()
        }
      });

    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/status/arrived-delivery
   * Mark arrived at delivery location
   */
  router.post('/:orderId/status/arrived-delivery', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { location, timestamp } = req.body;

      await updateOrderStatus(
        db,
        orderId,
        OrderStatus.ARRIVED_DELIVERY,
        EventTypes.ARRIVED_DELIVERY,
        { location, timestamp: timestamp || new Date() }
      );

      res.json({
        success: true,
        data: {
          status: OrderStatus.ARRIVED_DELIVERY,
          timestamp: timestamp || new Date()
        }
      });

    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/status/delivered
   * Mark order as delivered
   */
  router.post('/:orderId/status/delivered', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { timestamp, signature, recipientName } = req.body;

      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            status: OrderStatus.DELIVERED,
            deliveredAt: timestamp || new Date(),
            deliveryProof: {
              signature,
              recipientName,
              timestamp: timestamp || new Date()
            },
            updatedAt: new Date()
          }
        }
      );

      await createEvent(db, orderId, EventTypes.DELIVERED, {
        timestamp: timestamp || new Date(),
        recipientName
      });

      res.json({
        success: true,
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: timestamp || new Date()
        }
      });

    } catch (error) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 9. DOCUMENTS ====================

  /**
   * POST /api/transport-orders/:orderId/documents
   * Upload a document (BL, CMR, POD)
   */
  router.post('/:orderId/documents', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { type, url, metadata = {} } = req.body;

      if (!['BL', 'CMR', 'POD', 'OTHER'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document type. Must be BL, CMR, POD, or OTHER'
        });
      }

      const document = {
        orderId: new ObjectId(orderId),
        type,
        url,
        uploadedAt: new Date(),
        validated: false,
        metadata
      };

      const result = await db.collection('transport_documents').insertOne(document);

      // Update order
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $push: {
            documents: {
              _id: result.insertedId,
              type,
              url,
              uploadedAt: new Date(),
              validated: false
            }
          },
          $set: { updatedAt: new Date() }
        }
      );

      await createEvent(db, orderId, EventTypes.DOCUMENTS_UPLOADED, {
        documentType: type,
        documentId: result.insertedId
      });

      res.json({
        success: true,
        data: {
          documentId: result.insertedId,
          type,
          uploadedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/transport-orders/:orderId/documents
   * List all documents for an order
   */
  router.get('/:orderId/documents', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const documents = await db.collection('transport_documents')
        .find({ orderId: new ObjectId(orderId) })
        .sort({ uploadedAt: -1 })
        .toArray();

      res.json({
        success: true,
        data: documents
      });

    } catch (error) {
      console.error('Error listing documents:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 10. SCORING ====================

  /**
   * POST /api/transport-orders/:orderId/score
   * Calculate carrier score for completed order
   */
  router.post('/:orderId/score', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { metrics } = req.body;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (!order.assignedCarrierId) {
        return res.status(400).json({
          success: false,
          error: 'No carrier assigned to this order'
        });
      }

      // Calculate score
      const score = calculateCarrierScore(metrics);

      const scoreRecord = {
        orderId: new ObjectId(orderId),
        carrierId: order.assignedCarrierId,
        score,
        breakdown: metrics,
        scoredAt: new Date()
      };

      await db.collection('carrier_scores').insertOne(scoreRecord);

      // Update order
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            carrierScore: score,
            scoreMetrics: metrics,
            updatedAt: new Date()
          }
        }
      );

      await createEvent(db, orderId, EventTypes.CARRIER_SCORED, {
        carrierId: order.assignedCarrierId,
        score
      });

      res.json({
        success: true,
        data: {
          score,
          breakdown: metrics
        }
      });

    } catch (error) {
      console.error('Error calculating score:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 11. INCIDENTS ====================

  /**
   * POST /api/transport-orders/:orderId/incidents
   * Report an incident
   */
  router.post('/:orderId/incidents', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;
      const { type, description, estimatedDelay, location, severity = 'minor' } = req.body;

      if (!Object.values(IncidentTypes).includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid incident type'
        });
      }

      const incident = {
        orderId: new ObjectId(orderId),
        type,
        description,
        estimatedDelay,
        location,
        severity,
        reportedAt: new Date(),
        resolved: false
      };

      await db.collection('incidents').insertOne(incident);

      // Update order status if needed
      if (severity === 'major' || severity === 'critical') {
        await updateOrderStatus(
          db,
          orderId,
          OrderStatus.INCIDENT,
          EventTypes.INCIDENT_REPORTED,
          incident
        );
      } else {
        await createEvent(db, orderId, EventTypes.INCIDENT_REPORTED, incident);
      }

      res.json({
        success: true,
        data: incident
      });

    } catch (error) {
      console.error('Error reporting incident:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== 12. SEARCH & LISTING ====================

  /**
   * GET /api/transport-orders
   * List orders with filters and pagination
   */
  router.get('/', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const {
        industrialId,
        status,
        carrierId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20
      } = req.query;

      // Build query
      const query = {};

      if (industrialId) query.industrialId = industrialId;
      if (status) query.status = status;
      if (carrierId) query.assignedCarrierId = carrierId;

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const orders = await db.collection('transport_orders')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('transport_orders').countDocuments(query);

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Error listing orders:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/transport-orders/:orderId
   * Get complete order details
   */
  router.get('/:orderId', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.json({
        success: true,
        data: order
      });

    } catch (error) {
      console.error('Error getting order:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/transport-orders/:orderId/events
   * Get complete event history for an order
   */
  router.get('/:orderId/events', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const events = await db.collection('transport_events')
        .find({ orderId: new ObjectId(orderId) })
        .sort({ timestamp: -1 })
        .toArray();

      res.json({
        success: true,
        data: events
      });

    } catch (error) {
      console.error('Error getting events:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== TOMTOM ADVANCED FEATURES ====================

  /**
   * POST /api/transport-orders/:orderId/calculate-route
   * Calculate optimal route with TomTom (Premium tracking only)
   */
  router.post('/:orderId/calculate-route', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.trackingType !== 'PREMIUM') {
        return res.status(403).json({
          success: false,
          error: 'Route calculation requires Premium tracking'
        });
      }

      const origin = order.currentPosition || order.pickupAddress.coordinates;
      const destination = order.deliveryAddress.coordinates;

      const routeData = await tomtom.calculateRoute(origin, destination, {
        vehicleWeight: order.weight,
        departAt: new Date().toISOString(),
        traffic: true
      });

      res.json({
        success: routeData.success,
        data: routeData
      });

    } catch (error) {
      console.error('Error calculating route:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/check-delay
   * Check for potential delays (Premium tracking only)
   */
  router.post('/:orderId/check-delay', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.trackingType !== 'PREMIUM') {
        return res.status(403).json({
          success: false,
          error: 'Delay detection requires Premium tracking'
        });
      }

      if (!order.currentPosition) {
        return res.status(400).json({
          success: false,
          error: 'No current position available'
        });
      }

      const delayData = await tomtom.detectDelay(order, order.currentPosition);

      // If delay detected and significant, create event
      if (delayData.hasDelay && delayData.delayMinutes > 15) {
        await createEvent(db, orderId, EventTypes.TRACKING_DELAY_DETECTED, {
          delayMinutes: delayData.delayMinutes,
          recommendation: delayData.recommendation
        });

        // Update order status if critical
        if (delayData.delayMinutes > 60) {
          await updateOrderStatus(
            db,
            orderId,
            OrderStatus.DELAYED,
            EventTypes.DELAY_REPORTED,
            { delayMinutes: delayData.delayMinutes }
          );
        }
      }

      res.json({
        success: true,
        data: delayData
      });

    } catch (error) {
      console.error('Error checking delay:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/suggested-departure
   * Get suggested departure time to arrive on time
   */
  router.post('/:orderId/suggested-departure', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (!order.deliveryTimeWindow) {
        return res.status(400).json({
          success: false,
          error: 'No delivery time window defined'
        });
      }

      const origin = order.currentPosition || order.pickupAddress.coordinates;
      const destination = order.deliveryAddress.coordinates;
      const desiredArrival = new Date(order.deliveryTimeWindow.start);

      const suggestionData = await tomtom.getSuggestedDeparture(
        origin,
        destination,
        desiredArrival
      );

      res.json({
        success: suggestionData.success,
        data: suggestionData
      });

    } catch (error) {
      console.error('Error getting suggested departure:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/geocode
   * Geocode address to coordinates (utility endpoint)
   */
  router.post('/geocode', async (req, res) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'Address is required'
        });
      }

      const geocodeData = await tomtom.geocodeAddress(address);

      res.json(geocodeData);

    } catch (error) {
      console.error('Error geocoding address:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/reverse-geocode
   * Reverse geocode coordinates to address (utility endpoint)
   */
  router.post('/reverse-geocode', async (req, res) => {
    try {
      const { lat, lng } = req.body;

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const reverseData = await tomtom.reverseGeocode({ lat, lng });

      res.json(reverseData);

    } catch (error) {
      console.error('Error reverse geocoding:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ==================== LANE MATCHING AI ====================

  /**
   * POST /api/transport-orders/lanes/detect
   * Detect recurring transport lanes from historical orders
   */
  router.post('/lanes/detect', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { industrialId } = req.body;

      if (!industrialId) {
        return res.status(400).json({
          success: false,
          error: 'industrialId is required'
        });
      }

      // Detect lanes from historical orders
      const detectionResult = await laneMatching.detectLanes(db, industrialId);

      if (!detectionResult.success) {
        return res.status(500).json(detectionResult);
      }

      // Save detected lanes to database
      if (detectionResult.lanes.length > 0) {
        const saveResult = await laneMatching.saveLanes(
          db,
          industrialId,
          detectionResult.lanes
        );

        if (!saveResult.success) {
          return res.status(500).json(saveResult);
        }

        // Create event for lane detection
        await db.collection('transport_events').insertOne({
          eventType: EventTypes.LANE_DETECTED,
          timestamp: new Date(),
          data: {
            industrialId,
            lanesDetected: detectionResult.lanes.length,
            totalOrders: detectionResult.totalOrders
          },
          metadata: {
            source: 'AI',
            automatic: true
          }
        });
      }

      res.json({
        success: true,
        data: {
          lanes: detectionResult.lanes,
          totalOrders: detectionResult.totalOrders,
          analyzedPeriodDays: detectionResult.analyzedPeriodDays,
          saved: detectionResult.lanes.length
        }
      });

    } catch (error) {
      console.error('Error detecting lanes:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/transport-orders/:orderId/lane-match
   * Match an order to known transport lanes
   */
  router.post('/:orderId/lane-match', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { orderId } = req.params;

      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Match order to lanes
      const matchResult = await laneMatching.matchOrderToLane(db, order);

      if (!matchResult.success) {
        return res.status(500).json(matchResult);
      }

      // If matched, create event
      if (matchResult.matched) {
        await createEvent(db, orderId, EventTypes.LANE_DETECTED, {
          laneId: matchResult.bestMatch.laneId,
          score: matchResult.bestMatch.score,
          confidence: matchResult.bestMatch.confidence,
          recommendedCarriers: matchResult.bestMatch.recommendedCarriers
        });

        // Update order with lane information
        await db.collection('transport_orders').updateOne(
          { _id: new ObjectId(orderId) },
          {
            $set: {
              laneId: matchResult.bestMatch.laneId,
              laneMatchScore: matchResult.bestMatch.score,
              updatedAt: new Date()
            }
          }
        );
      }

      res.json({
        success: true,
        data: matchResult
      });

    } catch (error) {
      console.error('Error matching lane:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/transport-orders/lanes
   * Get all detected lanes for an industrial
   */
  router.get('/lanes', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { industrialId } = req.query;

      if (!industrialId) {
        return res.status(400).json({
          success: false,
          error: 'industrialId query parameter is required'
        });
      }

      const result = await laneMatching.getLanes(db, industrialId);

      res.json(result);

    } catch (error) {
      console.error('Error getting lanes:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/transport-orders/lanes/:laneId
   * Delete a specific lane
   */
  router.delete('/lanes/:laneId', checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const { laneId } = req.params;

      const result = await db.collection('transport_lanes').deleteOne({
        laneId
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Lane not found'
        });
      }

      res.json({
        success: true,
        message: 'Lane deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting lane:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createTransportOrdersRoutes;
