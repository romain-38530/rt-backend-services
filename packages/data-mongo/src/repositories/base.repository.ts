// @ts-nocheck
import { Collection, Filter, UpdateFilter, Document, OptionalId } from 'mongodb';
import { getDatabase } from '../connection/index.js';
import { PaginationParams, PaginationMeta } from '@rt/contracts';
import { calculatePagination, calculateSkip } from '@rt/utils';

/**
 * Base repository with common CRUD operations
 */
export abstract class BaseRepository<T extends Document> {
  protected collection: Collection<T>;

  constructor(collectionName: string) {
    this.collection = getDatabase().collection<T>(collectionName);
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<T | null> {
    return this.collection.findOne({ _id: id } as Filter<T>);
  }

  /**
   * Find one by filter
   */
  async findOne(filter: Filter<T>): Promise<T | null> {
    return this.collection.findOne(filter);
  }

  /**
   * Find many by filter
   */
  async findMany(filter: Filter<T> = {}): Promise<T[]> {
    return this.collection.find(filter).toArray();
  }

  /**
   * Find with pagination
   */
  async findWithPagination(
    filter: Filter<T> = {},
    pagination: PaginationParams = {}
  ): Promise<{ data: T[]; meta: PaginationMeta }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const sortBy = pagination.sortBy || 'createdAt';
    const sortOrder = pagination.sortOrder === 'asc' ? 1 : -1;

    const skip = calculateSkip(page, limit);

    const [data, total] = await Promise.all([
      this.collection
        .find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(filter),
    ]);

    const meta = calculatePagination(total, pagination);

    return { data, meta };
  }

  /**
   * Count documents
   */
  async count(filter: Filter<T> = {}): Promise<number> {
    return this.collection.countDocuments(filter);
  }

  /**
   * Create one
   */
  async create(data: OptionalId<T>): Promise<T> {
    const now = new Date();
    const document = {
      ...data,
      _id: data._id || this.generateId(),
      createdAt: now,
      updatedAt: now,
    } as OptionalId<T>;

    await this.collection.insertOne(document);
    return document as T;
  }

  /**
   * Create many
   */
  async createMany(data: OptionalId<T>[]): Promise<T[]> {
    const now = new Date();
    const documents = data.map((item) => ({
      ...item,
      _id: item._id || this.generateId(),
      createdAt: now,
      updatedAt: now,
    })) as OptionalId<T>[];

    await this.collection.insertMany(documents);
    return documents as T[];
  }

  /**
   * Update by ID
   */
  async updateById(id: string, update: UpdateFilter<T>): Promise<T | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id } as Filter<T>,
      {
        ...update,
        $set: {
          ...((update.$set as any) || {}),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Update one by filter
   */
  async updateOne(
    filter: Filter<T>,
    update: UpdateFilter<T>
  ): Promise<T | null> {
    const result = await this.collection.findOneAndUpdate(
      filter,
      {
        ...update,
        $set: {
          ...((update.$set as any) || {}),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return result || null;
  }

  /**
   * Update many
   */
  async updateMany(
    filter: Filter<T>,
    update: UpdateFilter<T>
  ): Promise<number> {
    const result = await this.collection.updateMany(filter, {
      ...update,
      $set: {
        ...((update.$set as any) || {}),
        updatedAt: new Date(),
      },
    });

    return result.modifiedCount;
  }

  /**
   * Delete by ID
   */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id } as Filter<T>);
    return result.deletedCount > 0;
  }

  /**
   * Delete one by filter
   */
  async deleteOne(filter: Filter<T>): Promise<boolean> {
    const result = await this.collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  /**
   * Delete many
   */
  async deleteMany(filter: Filter<T>): Promise<number> {
    const result = await this.collection.deleteMany(filter);
    return result.deletedCount;
  }

  /**
   * Check if document exists
   */
  async exists(filter: Filter<T>): Promise<boolean> {
    const count = await this.collection.countDocuments(filter, { limit: 1 });
    return count > 0;
  }

  /**
   * Generate unique ID
   */
  protected generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}_${random}`;
  }
}
