/**
 * Sub-users (Team Members) Routes
 * Manages team members for organizations
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');

// Subscription limits for sub-users
const SUBSCRIPTION_LIMITS = {
  free: 1,        // 1 membre pour le plan gratuit
  starter: 2,
  pro: 5,
  business: 15,
  enterprise: -1  // -1 = unlimited
};

// Get sub-users limit based on subscription
const getSubUsersLimit = (user) => {
  const subscription = user.subscription?.plan || 'free';
  const maxSubUsers = SUBSCRIPTION_LIMITS[subscription] ?? 0;
  return maxSubUsers;
};

function setupSubUsersRoutes(app, db, jwt, JWT_SECRET) {
  // Middleware to authenticate user from JWT
  const authenticateUser = async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });

      if (!user) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
  };

  // GET /api/subusers - List all sub-users for the authenticated user
  app.get('/api/subusers', authenticateUser, async (req, res) => {
    try {
      const parentUserId = req.user._id;

      // Get sub-users
      const subUsers = await db.collection('subusers').find({
        parentUserId: parentUserId
      }).sort({ createdAt: -1 }).toArray();

      // Calculate limit info
      const maxSubUsers = getSubUsersLimit(req.user);
      const currentCount = subUsers.length;

      res.json({
        success: true,
        data: {
          subUsers: subUsers.map(u => ({
            id: u._id.toString(),
            email: u.email,
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            accessLevel: u.accessLevel || 'reader',
            status: u.status || 'pending',
            invitedAt: u.createdAt?.toISOString() || new Date().toISOString()
          })),
          limit: {
            current: currentCount,
            max: maxSubUsers,
            remaining: maxSubUsers === -1 ? 999 : Math.max(0, maxSubUsers - currentCount),
            plan: req.user.subscription?.plan || 'free',
            canAdd: maxSubUsers === -1 || currentCount < maxSubUsers
          }
        }
      });

    } catch (error) {
      console.error('Error fetching subusers:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/subusers - Create/invite a new sub-user
  app.post('/api/subusers', authenticateUser, async (req, res) => {
    try {
      const { email, firstName, lastName, accessLevel } = req.body;
      const parentUserId = req.user._id;

      // Validate required fields
      if (!email || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          error: 'Email, firstName and lastName are required'
        });
      }

      // Check limit
      const currentCount = await db.collection('subusers').countDocuments({ parentUserId });
      const maxSubUsers = getSubUsersLimit(req.user);

      if (maxSubUsers !== -1 && currentCount >= maxSubUsers) {
        return res.status(403).json({
          success: false,
          error: `Limite atteinte (${maxSubUsers} membres max pour votre abonnement ${req.user.subscription?.plan || 'free'})`
        });
      }

      // Check if email already exists
      const existingSubUser = await db.collection('subusers').findOne({
        parentUserId,
        email: email.toLowerCase()
      });

      if (existingSubUser) {
        return res.status(409).json({
          success: false,
          error: 'Un membre avec cet email existe deja'
        });
      }

      // Create sub-user
      const newSubUser = {
        parentUserId,
        email: email.toLowerCase().trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        accessLevel: accessLevel || 'reader',
        status: 'pending',
        inviteToken: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('subusers').insertOne(newSubUser);

      // TODO: Send invitation email
      console.log(`[SUBUSERS] New sub-user invited: ${email} by ${req.user.email}`);

      res.status(201).json({
        success: true,
        data: {
          id: result.insertedId.toString(),
          email: newSubUser.email,
          firstName: newSubUser.firstName,
          lastName: newSubUser.lastName,
          accessLevel: newSubUser.accessLevel,
          status: newSubUser.status
        }
      });

    } catch (error) {
      console.error('Error creating subuser:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT /api/subusers/:id - Update a sub-user
  app.put('/api/subusers/:id', authenticateUser, async (req, res) => {
    try {
      const { id } = req.params;
      const { firstName, lastName, accessLevel } = req.body;
      const parentUserId = req.user._id;

      // Find the sub-user
      const subUser = await db.collection('subusers').findOne({
        _id: new ObjectId(id),
        parentUserId
      });

      if (!subUser) {
        return res.status(404).json({ success: false, error: 'Membre non trouve' });
      }

      // Update
      const updateData = {
        updatedAt: new Date()
      };

      if (firstName) updateData.firstName = firstName.trim();
      if (lastName) updateData.lastName = lastName.trim();
      if (accessLevel) updateData.accessLevel = accessLevel;

      await db.collection('subusers').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      console.log(`[SUBUSERS] Sub-user updated: ${subUser.email} by ${req.user.email}`);

      res.json({
        success: true,
        data: {
          id,
          ...updateData
        }
      });

    } catch (error) {
      console.error('Error updating subuser:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE /api/subusers/:id - Delete a sub-user
  app.delete('/api/subusers/:id', authenticateUser, async (req, res) => {
    try {
      const { id } = req.params;
      const parentUserId = req.user._id;

      // Find and delete the sub-user
      const result = await db.collection('subusers').deleteOne({
        _id: new ObjectId(id),
        parentUserId
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, error: 'Membre non trouve' });
      }

      console.log(`[SUBUSERS] Sub-user deleted: ${id} by ${req.user.email}`);

      res.json({ success: true });

    } catch (error) {
      console.error('Error deleting subuser:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/subusers/:id/resend-invite - Resend invitation email
  app.post('/api/subusers/:id/resend-invite', authenticateUser, async (req, res) => {
    try {
      const { id } = req.params;
      const parentUserId = req.user._id;

      // Find the sub-user
      const subUser = await db.collection('subusers').findOne({
        _id: new ObjectId(id),
        parentUserId
      });

      if (!subUser) {
        return res.status(404).json({ success: false, error: 'Membre non trouve' });
      }

      // Generate new invite token
      const newToken = crypto.randomBytes(32).toString('hex');

      await db.collection('subusers').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            inviteToken: newToken,
            updatedAt: new Date()
          }
        }
      );

      // TODO: Send invitation email
      console.log(`[SUBUSERS] Invitation resent to: ${subUser.email} by ${req.user.email}`);

      res.json({ success: true, message: 'Invitation renvoyee' });

    } catch (error) {
      console.error('Error resending invite:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('Sub-users (Team Members) routes configured');
}

module.exports = { setupSubUsersRoutes };
