import mongoose, { Schema, Document } from 'mongoose';

export type AccessLevel = 'admin' | 'editor' | 'reader';
export type SubUserStatus = 'active' | 'inactive' | 'pending';
export type Universe = 'industry' | 'logistician' | 'transporter' | 'forwarder' | 'supplier' | 'recipient';

export interface ISubUser extends Document {
  parentUserId: mongoose.Types.ObjectId;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  accessLevel: AccessLevel;
  universes: Universe[];
  status: SubUserStatus;
  invitedAt: Date;
  activatedAt?: Date;
  activationToken?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubUserSchema = new Schema({
  parentUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: { type: String },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: String,
  avatar: String,
  accessLevel: {
    type: String,
    enum: ['admin', 'editor', 'reader'],
    default: 'reader',
    required: true
  },
  universes: [{
    type: String,
    enum: ['industry', 'logistician', 'transporter', 'forwarder', 'supplier', 'recipient']
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending'
  },
  invitedAt: { type: Date, default: Date.now },
  activatedAt: Date,
  activationToken: String,
  lastLoginAt: Date
}, {
  timestamps: true
});

SubUserSchema.index({ parentUserId: 1, status: 1 });
SubUserSchema.index({ email: 1 });

export default mongoose.model<ISubUser>('SubUser', SubUserSchema);
