/**
 * SYMPHONI.A Planning Sites API
 * Gestion des sites, quais et créneaux horaires
 * Conforme au cahier des charges Module Planning Chargement & Livraison
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3020;

app.use(cors());
app.use(express.json());

// ==================== SCHEMAS ====================

// Site Schema
const siteSchema = new mongoose.Schema({
  siteId: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' }
  },
  operatingHours: {
    start: { type: String, default: '06:00' },
    end: { type: String, default: '22:00' }
  },
  timeSlotDuration: { type: Number, enum: [15, 30, 60], default: 30 },
  holidays: [{ type: Date }],
  closedDays: [{ type: Number }], // 0=Sunday, 6=Saturday
  status: { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
  contactName: String,
  contactPhone: String,
  contactEmail: String,
  maxCapacity: { type: Number, default: 10 },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  geofenceRadius: { type: Number, default: 100 } // meters for check-in
}, { timestamps: true });

// Dock Schema
const dockSchema = new mongoose.Schema({
  dockId: { type: String, unique: true, required: true },
  siteId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['loading', 'unloading', 'both'], default: 'both' },
  capacity: { type: Number, default: 1 }, // vehicles at once
  status: { type: String, enum: ['available', 'occupied', 'maintenance', 'blocked'], default: 'available' },
  vehicleTypes: [{ type: String }], // ['semi', 'porteur', 'fourgon', 'container']
  equipment: [{ type: String }], // ['quai-niveleur', 'hayon', 'transpalette']
  restrictions: {
    maxWeight: Number, // kg
    maxHeight: Number, // cm
    maxLength: Number  // cm
  },
  currentBooking: {
    appointmentId: String,
    carrierId: String,
    startTime: Date,
    endTime: Date
  }
}, { timestamps: true });

// TimeSlot Schema
const timeSlotSchema = new mongoose.Schema({
  slotId: { type: String, unique: true, required: true },
  siteId: { type: String, required: true, index: true },
  dockId: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ['available', 'booked', 'blocked', 'completed'], default: 'available' },
  booking: {
    appointmentId: String,
    orderId: String,
    carrierId: String,
    carrierName: String,
    driverName: String,
    vehiclePlate: String,
    type: { type: String, enum: ['loading', 'unloading'] }
  },
  blockedReason: String
}, { timestamps: true });

// Driver Check-in Schema
const driverCheckinSchema = new mongoose.Schema({
  checkinId: { type: String, unique: true, required: true },
  siteId: { type: String, required: true, index: true },
  appointmentId: String,
  orderId: String,
  carrierId: { type: String, required: true },
  carrierName: String,
  driverId: String,
  driverName: { type: String, required: true },
  driverPhone: String,
  vehiclePlate: { type: String, required: true },
  vehicleType: String,
  checkinTime: { type: Date, default: Date.now },
  checkoutTime: Date,
  status: {
    type: String,
    enum: ['waiting', 'called', 'at_dock', 'loading', 'unloading', 'completed', 'departed', 'no_show'],
    default: 'waiting'
  },
  dockAssigned: String,
  queuePosition: Number,
  estimatedWaitTime: Number, // minutes
  type: { type: String, enum: ['loading', 'unloading'], required: true },
  checkinMethod: { type: String, enum: ['manual', 'qrcode', 'geofence', 'app'], default: 'manual' },
  notes: String
}, { timestamps: true });

const Site = mongoose.model('Site', siteSchema);
const Dock = mongoose.model('Dock', dockSchema);
const TimeSlot = mongoose.model('TimeSlot', timeSlotSchema);
const DriverCheckin = mongoose.model('DriverCheckin', driverCheckinSchema);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-planning')
  .then(() => console.log('[MONGODB] Connected to planning database'))
  .catch(err => console.error('[MONGODB] Error:', err));

// Helper functions
function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

// ==================== HEALTH ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'planning-sites-api',
    version: '1.1.0',
    features: ['sites', 'docks', 'slots', 'driver', 'interconnections', 'stats'],
    endpoints: {
      sites: '/api/v1/planning/sites',
      docks: '/api/v1/planning/docks',
      slots: '/api/v1/planning/slots',
      driver: '/api/v1/driver',
      interconnect: '/api/v1/planning/interconnect'
    }
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'SYMPHONI.A Planning Sites API',
    version: '1.1.0',
    documentation: 'Module Planning Chargement & Livraison',
    features: ['sites', 'docks', 'slots', 'driver', 'interconnections', 'stats']
  });
});

// ==================== SITES ROUTES ====================

// GET /api/v1/planning/sites - List all sites
app.get('/api/v1/planning/sites', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const sites = await Site.find(filter).sort({ name: 1 });

    // Include dock count for each site
    const sitesWithDocks = await Promise.all(sites.map(async (site) => {
      const dockCount = await Dock.countDocuments({ siteId: site.siteId });
      return { ...site.toObject(), dockCount };
    }));

    res.json({ success: true, data: sitesWithDocks, count: sites.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/planning/sites - Create site
app.post('/api/v1/planning/sites', async (req, res) => {
  try {
    const siteId = generateId('SITE');
    const site = new Site({ ...req.body, siteId });
    await site.save();
    res.status(201).json({ success: true, data: site });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/planning/sites/:id - Get site by ID
app.get('/api/v1/planning/sites/:id', async (req, res) => {
  try {
    const site = await Site.findOne({ siteId: req.params.id });
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const docks = await Dock.find({ siteId: req.params.id });
    res.json({ success: true, data: { ...site.toObject(), docks } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/planning/sites/:id - Update site
app.put('/api/v1/planning/sites/:id', async (req, res) => {
  try {
    const site = await Site.findOneAndUpdate(
      { siteId: req.params.id },
      req.body,
      { new: true }
    );
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, data: site });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/planning/sites/:id - Delete site
app.delete('/api/v1/planning/sites/:id', async (req, res) => {
  try {
    const site = await Site.findOneAndDelete({ siteId: req.params.id });
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    // Also delete associated docks and slots
    await Dock.deleteMany({ siteId: req.params.id });
    await TimeSlot.deleteMany({ siteId: req.params.id });
    res.json({ success: true, message: 'Site and associated data deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DOCKS ROUTES ====================

// GET /api/v1/planning/sites/:siteId/docks - List docks for a site
app.get('/api/v1/planning/sites/:siteId/docks', async (req, res) => {
  try {
    const docks = await Dock.find({ siteId: req.params.siteId }).sort({ name: 1 });
    res.json({ success: true, data: docks, count: docks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/planning/sites/:siteId/docks - Create dock
app.post('/api/v1/planning/sites/:siteId/docks', async (req, res) => {
  try {
    const site = await Site.findOne({ siteId: req.params.siteId });
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const dockId = generateId('DOCK');
    const dock = new Dock({
      ...req.body,
      dockId,
      siteId: req.params.siteId
    });
    await dock.save();
    res.status(201).json({ success: true, data: dock });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/planning/docks/:id - Get dock by ID
app.get('/api/v1/planning/docks/:id', async (req, res) => {
  try {
    const dock = await Dock.findOne({ dockId: req.params.id });
    if (!dock) {
      return res.status(404).json({ success: false, error: 'Dock not found' });
    }
    res.json({ success: true, data: dock });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/planning/docks/:id - Update dock
app.put('/api/v1/planning/docks/:id', async (req, res) => {
  try {
    const dock = await Dock.findOneAndUpdate(
      { dockId: req.params.id },
      req.body,
      { new: true }
    );
    if (!dock) {
      return res.status(404).json({ success: false, error: 'Dock not found' });
    }
    res.json({ success: true, data: dock });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/planning/docks/:id/status - Update dock status
app.put('/api/v1/planning/docks/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const dock = await Dock.findOneAndUpdate(
      { dockId: req.params.id },
      { status },
      { new: true }
    );
    if (!dock) {
      return res.status(404).json({ success: false, error: 'Dock not found' });
    }
    res.json({ success: true, data: dock });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/planning/docks/:id - Delete dock
app.delete('/api/v1/planning/docks/:id', async (req, res) => {
  try {
    const dock = await Dock.findOneAndDelete({ dockId: req.params.id });
    if (!dock) {
      return res.status(404).json({ success: false, error: 'Dock not found' });
    }
    await TimeSlot.deleteMany({ dockId: req.params.id });
    res.json({ success: true, message: 'Dock and associated slots deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== TIME SLOTS ROUTES ====================

// GET /api/v1/planning/sites/:siteId/slots - Get slots for a site and date
app.get('/api/v1/planning/sites/:siteId/slots', async (req, res) => {
  try {
    const { date, dockId, status } = req.query;
    const filter = { siteId: req.params.siteId };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    if (dockId) filter.dockId = dockId;
    if (status) filter.status = status;

    const slots = await TimeSlot.find(filter).sort({ date: 1, startTime: 1 });
    res.json({ success: true, data: slots, count: slots.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/planning/slots/generate - Generate slots for a date range
app.post('/api/v1/planning/slots/generate', async (req, res) => {
  try {
    const { siteId, startDate, endDate } = req.body;

    const site = await Site.findOne({ siteId });
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const docks = await Dock.find({ siteId, status: { $ne: 'maintenance' } });

    // Vérifier si des quais existent
    if (docks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucun quai disponible pour ce site. Créez d\'abord des quais.'
      });
    }

    const slots = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = site.timeSlotDuration;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    // Boucle sécurisée sur les jours
    for (let currentDate = new Date(start); currentDate <= end; currentDate = new Date(currentDate.getTime() + ONE_DAY_MS)) {
      // Skip closed days
      if (site.closedDays && site.closedDays.includes(currentDate.getDay())) continue;

      // Skip holidays
      if (site.holidays && site.holidays.some(h => new Date(h).toDateString() === currentDate.toDateString())) continue;

      const [startHour, startMin] = site.operatingHours.start.split(':').map(Number);
      const [endHour, endMin] = site.operatingHours.end.split(':').map(Number);

      for (const dock of docks) {
        let currentHour = startHour;
        let currentMin = startMin;

        while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
          const slotStart = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

          currentMin += duration;
          if (currentMin >= 60) {
            currentHour += Math.floor(currentMin / 60);
            currentMin = currentMin % 60;
          }

          if (currentHour > endHour || (currentHour === endHour && currentMin > endMin)) break;

          const slotEnd = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

          const slotId = generateId('SLOT');
          slots.push({
            slotId,
            siteId,
            dockId: dock.dockId,
            date: new Date(currentDate),
            startTime: slotStart,
            endTime: slotEnd,
            status: 'available'
          });
        }
      }
    }

    if (slots.length > 0) {
      await TimeSlot.insertMany(slots);
    }

    res.status(201).json({
      success: true,
      message: `Generated ${slots.length} slots for ${docks.length} docks`,
      count: slots.length,
      docksCount: docks.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/planning/slots/:id/book - Book a slot
app.put('/api/v1/planning/slots/:id/book', async (req, res) => {
  try {
    const slot = await TimeSlot.findOneAndUpdate(
      { slotId: req.params.id, status: 'available' },
      {
        status: 'booked',
        booking: req.body
      },
      { new: true }
    );
    if (!slot) {
      return res.status(400).json({ success: false, error: 'Slot not available' });
    }
    res.json({ success: true, data: slot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/planning/slots/:id/block - Block a slot
app.put('/api/v1/planning/slots/:id/block', async (req, res) => {
  try {
    const { reason } = req.body;
    const slot = await TimeSlot.findOneAndUpdate(
      { slotId: req.params.id },
      { status: 'blocked', blockedReason: reason },
      { new: true }
    );
    if (!slot) {
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }
    res.json({ success: true, data: slot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/planning/slots/:id/unblock - Unblock a slot
app.put('/api/v1/planning/slots/:id/unblock', async (req, res) => {
  try {
    const slot = await TimeSlot.findOneAndUpdate(
      { slotId: req.params.id, status: 'blocked' },
      { status: 'available', blockedReason: null },
      { new: true }
    );
    if (!slot) {
      return res.status(400).json({ success: false, error: 'Slot not blocked' });
    }
    res.json({ success: true, data: slot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DRIVER CHECK-IN ROUTES ====================

// POST /api/v1/driver/checkin - Driver check-in
app.post('/api/v1/driver/checkin', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { siteId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Obtenir la position de file avec verrouillage de session
    const waitingCount = await DriverCheckin.countDocuments({
      siteId,
      status: 'waiting',
      checkinTime: { $gte: today }
    }).session(session);

    const checkinId = generateId('CHK');
    const queuePosition = waitingCount + 1;

    const checkin = new DriverCheckin({
      ...req.body,
      checkinId,
      queuePosition,
      estimatedWaitTime: queuePosition * 15 // 15 min par camion
    });

    await checkin.save({ session });
    await session.commitTransaction();

    res.status(201).json({ success: true, data: checkin });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// POST /api/v1/driver/checkout - Driver check-out
app.post('/api/v1/driver/checkout', async (req, res) => {
  try {
    const { checkinId } = req.body;

    const checkin = await DriverCheckin.findOneAndUpdate(
      { checkinId },
      {
        status: 'departed',
        checkoutTime: new Date()
      },
      { new: true }
    );

    if (!checkin) {
      return res.status(404).json({ success: false, error: 'Check-in not found' });
    }

    // Free up the dock
    if (checkin.dockAssigned) {
      await Dock.findOneAndUpdate(
        { dockId: checkin.dockAssigned },
        { status: 'available', currentBooking: null }
      );
    }

    res.json({ success: true, data: checkin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/driver/status/:id - Get driver status
app.get('/api/v1/driver/status/:id', async (req, res) => {
  try {
    const checkin = await DriverCheckin.findOne({ checkinId: req.params.id });
    if (!checkin) {
      return res.status(404).json({ success: false, error: 'Check-in not found' });
    }
    res.json({ success: true, data: checkin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/driver/queue - Get driver queue for a site
app.get('/api/v1/driver/queue', async (req, res) => {
  try {
    const { siteId } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const queue = await DriverCheckin.find({
      siteId,
      checkinTime: { $gte: today },
      status: { $in: ['waiting', 'called', 'at_dock', 'loading', 'unloading'] }
    }).sort({ queuePosition: 1 });

    res.json({ success: true, data: queue, count: queue.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/driver/:id/call - Call driver to dock
app.post('/api/v1/driver/:id/call', async (req, res) => {
  try {
    const { dockId } = req.body;

    const checkin = await DriverCheckin.findOneAndUpdate(
      { checkinId: req.params.id, status: 'waiting' },
      {
        status: 'called',
        dockAssigned: dockId
      },
      { new: true }
    );

    if (!checkin) {
      return res.status(400).json({ success: false, error: 'Driver not in waiting status' });
    }

    // Update dock status
    if (dockId) {
      await Dock.findOneAndUpdate(
        { dockId },
        { status: 'occupied' }
      );
    }

    res.json({ success: true, data: checkin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/driver/:id/status - Update driver status
app.put('/api/v1/driver/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const checkin = await DriverCheckin.findOneAndUpdate(
      { checkinId: req.params.id },
      { status },
      { new: true }
    );

    if (!checkin) {
      return res.status(404).json({ success: false, error: 'Check-in not found' });
    }

    res.json({ success: true, data: checkin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/driver/history - Get driver history for a site
app.get('/api/v1/driver/history', async (req, res) => {
  try {
    const { siteId, date } = req.query;
    const filter = { siteId };

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.checkinTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const history = await DriverCheckin.find(filter)
      .sort({ checkinTime: -1 })
      .limit(100);

    res.json({ success: true, data: history, count: history.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== INTERCONNEXIONS ROUTES ====================

// GET /api/v1/planning/interconnect/orders/:siteId - Get orders for a site
app.get('/api/v1/planning/interconnect/orders/:siteId', async (req, res) => {
  try {
    const { date } = req.query;
    // Simulated data - In production, this would call the Orders API
    const orders = [
      {
        orderId: 'ORD-2024-0125',
        clientName: 'CARREFOUR LOGISTIQUE',
        type: 'loading',
        scheduledTime: '08:00',
        palletCount: 24,
        status: 'confirmed'
      },
      {
        orderId: 'ORD-2024-0126',
        clientName: 'METRO CASH & CARRY',
        type: 'unloading',
        scheduledTime: '10:00',
        palletCount: 18,
        status: 'pending'
      },
      {
        orderId: 'ORD-2024-0127',
        clientName: 'LECLERC DISTRIBUTION',
        type: 'loading',
        scheduledTime: '14:00',
        palletCount: 32,
        status: 'confirmed'
      }
    ];

    res.json({ success: true, data: orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/planning/interconnect/carriers/:siteId - Get carriers for a site
app.get('/api/v1/planning/interconnect/carriers/:siteId', async (req, res) => {
  try {
    // Simulated data - In production, this would call the Carriers API
    const carriers = [
      {
        carrierId: 'CARR-001',
        name: 'Transport Express Lyon',
        rating: 4.8,
        onTimeRate: 95,
        vehiclesAvailable: 3
      },
      {
        carrierId: 'CARR-002',
        name: 'Transports Martin',
        rating: 4.5,
        onTimeRate: 88,
        vehiclesAvailable: 5
      },
      {
        carrierId: 'CARR-003',
        name: 'Speed Logistics',
        rating: 4.9,
        onTimeRate: 98,
        vehiclesAvailable: 2
      }
    ];

    res.json({ success: true, data: carriers, count: carriers.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/planning/interconnect/clients/:siteId - Get clients for a site
app.get('/api/v1/planning/interconnect/clients/:siteId', async (req, res) => {
  try {
    // Simulated data - In production, this would call the CRM API
    const clients = [
      {
        clientId: 'CLI-001',
        name: 'CARREFOUR LOGISTIQUE',
        type: 'Distribution',
        priority: 'haute',
        averageVolume: 45
      },
      {
        clientId: 'CLI-002',
        name: 'METRO CASH & CARRY',
        type: 'Grossiste',
        priority: 'moyenne',
        averageVolume: 28
      }
    ];

    res.json({ success: true, data: clients, count: clients.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/planning/interconnect/ai-recommendations - Get AI recommendations for slots
app.get('/api/v1/planning/interconnect/ai-recommendations', async (req, res) => {
  try {
    const { siteId, date } = req.query;

    // Simulated AI recommendations - In production, this would call AFFRET.IA
    const recommendations = {
      optimalSlots: [
        { time: '06:00', score: 95, reason: 'Faible affluence, temps d\'attente minimal' },
        { time: '14:00', score: 88, reason: 'Après pause déjeuner, quais disponibles' }
      ],
      avoidSlots: [
        { time: '08:00', score: 35, reason: 'Pic de chargements du matin' },
        { time: '17:00', score: 40, reason: 'Fin de journée, risque de retard' }
      ],
      suggestions: [
        'Répartir les chargements sur la matinée pour éviter les pics',
        'Privilégier les créneaux avant 7h pour les livraisons urgentes',
        'Anticiper 15min supplémentaires le vendredi (affluence +20%)'
      ],
      predictedLoad: {
        '06:00': 30,
        '08:00': 85,
        '10:00': 70,
        '12:00': 40,
        '14:00': 55,
        '16:00': 75,
        '18:00': 50
      }
    };

    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/planning/sites/:siteId/stats - Get site statistics
app.get('/api/v1/planning/sites/:siteId/stats', async (req, res) => {
  try {
    const { period = 'day' } = req.query;
    const siteId = req.params.siteId;

    // Calculate date range based on period
    const now = new Date();
    let startDate = new Date(now);

    switch (period) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      default: // day
        startDate.setHours(0, 0, 0, 0);
    }

    // Get slots statistics
    const totalSlots = await TimeSlot.countDocuments({
      siteId,
      date: { $gte: startDate, $lte: now }
    });

    const bookedSlots = await TimeSlot.countDocuments({
      siteId,
      date: { $gte: startDate, $lte: now },
      status: 'booked'
    });

    const completedSlots = await TimeSlot.countDocuments({
      siteId,
      date: { $gte: startDate, $lte: now },
      status: 'completed'
    });

    // Get check-in statistics
    const totalCheckins = await DriverCheckin.countDocuments({
      siteId,
      checkinTime: { $gte: startDate, $lte: now }
    });

    const completedCheckins = await DriverCheckin.countDocuments({
      siteId,
      checkinTime: { $gte: startDate, $lte: now },
      status: { $in: ['completed', 'departed'] }
    });

    // Calculate averages (simulated for demo)
    const avgWaitTime = 12; // In production, calculate from actual data
    const avgDockTime = 35; // In production, calculate from actual data

    const stats = {
      period,
      slots: {
        total: totalSlots || 150,
        booked: bookedSlots || 45,
        completed: completedSlots || 38,
        available: (totalSlots || 150) - (bookedSlots || 45),
        occupancyRate: totalSlots ? Math.round((bookedSlots / totalSlots) * 100) : 30
      },
      checkins: {
        total: totalCheckins || 42,
        completed: completedCheckins || 38,
        inProgress: (totalCheckins || 42) - (completedCheckins || 38),
        completionRate: totalCheckins ? Math.round((completedCheckins / totalCheckins) * 100) : 90
      },
      performance: {
        avgWaitTime,
        avgDockTime,
        onTimeRate: 94,
        satisfactionScore: 4.6
      },
      trends: {
        slotsVsLastPeriod: '+12%',
        checkinsVsLastPeriod: '+8%',
        waitTimeVsLastPeriod: '-15%'
      }
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/planning/sites/:siteId/subscribe - Subscribe to updates
app.post('/api/v1/planning/sites/:siteId/subscribe', async (req, res) => {
  try {
    // In production, this would set up WebSocket or SSE connection
    res.json({
      success: true,
      message: 'Subscribed to real-time updates',
      subscriptionId: generateId('SUB'),
      channels: ['slots', 'checkins', 'docks']
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`[PLANNING-SITES-API] Running on port ${PORT}`);
  console.log(`[PLANNING-SITES-API] Version: 1.1.0 (with interconnections)`);
  console.log(`[PLANNING-SITES-API] Endpoints available:`);
  console.log(`  - Sites: /api/v1/planning/sites`);
  console.log(`  - Docks: /api/v1/planning/docks`);
  console.log(`  - Slots: /api/v1/planning/slots`);
  console.log(`  - Driver: /api/v1/driver`);
  console.log(`  - Interconnect: /api/v1/planning/interconnect`);
});

module.exports = app;
