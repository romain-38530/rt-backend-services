import mongoose, { Schema, Document } from 'mongoose';

export interface IOrder extends Document {
  orderNumber: string;
  customerName: string;
  status: string;
  items: Array<{
    product: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  items: [{
    product: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
  }],
  totalAmount: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

OrderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IOrder>('Order', OrderSchema);
