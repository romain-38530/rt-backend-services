/**
 * SYMPHONI.A Appointments API
 * Gestion des rendez-vous d'enlèvement et de livraison
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const io = require('socket.io-client');

const app = express();
const PORT = process.env.PORT || 3013;

app.use(cors());
app.use(express.json());

// WebSocket
let websocket = null;
if (process.env.WEBSOCKET_URL) {
  websocket = io(process.env.WEBSOCKET_URL);
}

function emitEvent(eventName, data) {
  if (websocket?.connected) {
    websocket.emit('emit-event', { eventName, data });
  }
}

// Appointment Schema
const appointmentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  type: { type: String, enum: ['pickup', 'delivery'], required: true },
  status: {
    type: String,
    enum: ['pending', 'proposed', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  requestedBy: { type: String, required: true },
  requestedDate: Date,
  proposedDates: [{
    date: Date,
    timeSlot: { start: String, end: String },
    proposedBy: String,
    proposedAt: Date
  }],
  confirmedDate: Date,
  confirmedTimeSlot: { start: String, end: String },
  confirmedAt: Date,
  confirmedBy: String,
  location: {
    name: String,
    address: String,
    city: String,
    postalCode: String,
    contact: {
      name: String,
      phone: String,
      email: String
    }
  },
  notes: String,
  cancelledAt: Date,
  cancellationReason: String
}, { timestamps: true });

const Appointment = mongoose.model('Appointment', appointmentSchema);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[MONGODB] Connected'))
  .catch(err => console.error('[MONGODB] Error:', err));

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'appointments-api', version: '1.0.0' });
});

// GET /api/v1/appointments - Lister les RDV
app.get('/api/v1/appointments', async (req, res) => {
  try {
    const { orderId, status, type } = req.query;
    const filters = {};
    if (orderId) filters.orderId = orderId;
    if (status) filters.status = status;
    if (type) filters.type = type;

    const appointments = await Appointment.find(filters).sort({ createdAt: -1 });
    res.json({ success: true, data: appointments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/appointments/propose - Proposer un RDV
app.post('/api/v1/appointments/propose', async (req, res) => {
  try {
    const { orderId, type, requestedBy, proposedDates, location, notes } = req.body;

    let appointment = await Appointment.findOne({ orderId, type });

    if (appointment) {
      // Ajouter une nouvelle proposition
      appointment.proposedDates.push(...proposedDates.map(d => ({
        ...d,
        proposedBy: requestedBy,
        proposedAt: new Date()
      })));
      appointment.status = 'proposed';
    } else {
      // Créer nouveau RDV
      appointment = new Appointment({
        orderId,
        type,
        requestedBy,
        proposedDates: proposedDates.map(d => ({
          ...d,
          proposedBy: requestedBy,
          proposedAt: new Date()
        })),
        location,
        notes,
        status: 'proposed'
      });
    }

    await appointment.save();

    emitEvent('rdv.proposed', {
      orderId,
      type,
      appointmentId: appointment._id,
      proposedDates: appointment.proposedDates
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/appointments/:id/confirm - Confirmer un RDV
app.put('/api/v1/appointments/:id/confirm', async (req, res) => {
  try {
    const { confirmedDate, confirmedTimeSlot, confirmedBy } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        status: 'confirmed',
        confirmedDate,
        confirmedTimeSlot,
        confirmedBy,
        confirmedAt: new Date()
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    emitEvent('rdv.confirmed', {
      orderId: appointment.orderId,
      type: appointment.type,
      appointmentId: appointment._id,
      confirmedDate,
      confirmedTimeSlot
    });

    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/appointments/:id/reschedule - Replanifier un RDV
app.put('/api/v1/appointments/:id/reschedule', async (req, res) => {
  try {
    const { newDate, newTimeSlot, reason } = req.body;

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    appointment.proposedDates.push({
      date: newDate,
      timeSlot: newTimeSlot,
      proposedBy: req.body.requestedBy,
      proposedAt: new Date()
    });
    appointment.status = 'proposed';
    await appointment.save();

    emitEvent('rdv.rescheduled', {
      orderId: appointment.orderId,
      appointmentId: appointment._id,
      newDate,
      reason
    });

    res.json({ success: true, data: appointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/appointments/:id/cancel - Annuler un RDV
app.delete('/api/v1/appointments/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    emitEvent('rdv.cancelled', {
      orderId: appointment.orderId,
      appointmentId: appointment._id,
      reason
    });

    res.json({ success: true, message: 'Appointment cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/appointments/availability - Vérifier disponibilités
app.get('/api/v1/appointments/availability', async (req, res) => {
  try {
    const { date, location } = req.query;

    // Logique simplifiée de disponibilité
    const existingAppointments = await Appointment.find({
      'location.postalCode': location,
      confirmedDate: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
      },
      status: 'confirmed'
    });

    const availableSlots = [
      { start: '08:00', end: '10:00', available: true },
      { start: '10:00', end: '12:00', available: true },
      { start: '14:00', end: '16:00', available: true },
      { start: '16:00', end: '18:00', available: true }
    ];

    res.json({
      success: true,
      date,
      slots: availableSlots,
      bookedCount: existingAppointments.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[APPOINTMENTS API] Running on port ${PORT}`);
});

module.exports = app;
