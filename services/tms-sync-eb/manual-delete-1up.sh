#!/bin/bash

# Suppression manuelle de "1 UP" via MongoDB direct access

echo "Connecting to MongoDB and deleting '1 UP'..."

# Using mongo shell command (if available)
mongosh "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/symphonia" --eval "
db.carriers.deleteOne({ externalId: '3867700', companyName: '1 UP' });
db.carriers.countDocuments({ externalSource: 'dashdoc' });
"

echo "Done!"
