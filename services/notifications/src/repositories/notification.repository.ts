import { Collection } from 'mongodb';
import { BaseRepository } from '@rt/data-mongo';
import type { Notification } from '@rt/contracts';
import { NotificationStatus } from '@rt/contracts';

export class NotificationRepository extends BaseRepository<Notification> {
  constructor(collection: Collection<Notification>) {
    super(collection);
  }

  async findByUserId(userId: string): Promise<Notification[]> {
    return this.collection.find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  async findUnread(userId: string): Promise<Notification[]> {
    return this.collection
      .find({ userId, readAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findPending(): Promise<Notification[]> {
    return this.collection
      .find({ status: NotificationStatus.PENDING })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: notificationId as any },
      { $set: { readAt: new Date(), updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  async updateStatus(
    notificationId: string,
    status: NotificationStatus,
    errorMessage?: string
  ): Promise<boolean> {
    const update: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === NotificationStatus.SENT) {
      update.sentAt = new Date();
    }

    if (errorMessage) {
      update.errorMessage = errorMessage;
      update.retryCount = { $inc: 1 };
    }

    const result = await this.collection.updateOne(
      { _id: notificationId as any },
      { $set: update }
    );

    return result.modifiedCount > 0;
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.collection.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: [NotificationStatus.SENT, NotificationStatus.FAILED] },
    });

    return result.deletedCount || 0;
  }
}
