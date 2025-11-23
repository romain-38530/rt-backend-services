import { Collection } from 'mongodb';
import { BaseRepository } from '@rt/data-mongo';
import { Planning, PlanningStatus, Task, TaskStatus } from '@rt/contracts';

export class PlanningRepository extends BaseRepository<Planning> {
  constructor(collection: Collection<Planning>) {
    super(collection);
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Planning[]> {
    return this.collection
      .find({
        $or: [
          {
            startDate: { $gte: startDate, $lte: endDate },
          },
          {
            endDate: { $gte: startDate, $lte: endDate },
          },
          {
            startDate: { $lte: startDate },
            endDate: { $gte: endDate },
          },
        ],
      })
      .sort({ startDate: 1 })
      .toArray();
  }

  async findByStatus(status: PlanningStatus): Promise<Planning[]> {
    return this.collection
      .find({ status })
      .sort({ startDate: 1 })
      .toArray();
  }

  async findByDriver(driverId: string): Promise<Planning[]> {
    return this.collection
      .find({ driverId })
      .sort({ startDate: -1 })
      .toArray();
  }

  async findByVehicle(vehicleId: string): Promise<Planning[]> {
    return this.collection
      .find({ vehicleId })
      .sort({ startDate: -1 })
      .toArray();
  }

  async addTask(planningId: string, task: Task): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: planningId as any },
      {
        $push: { tasks: task },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount > 0;
  }

  async updateTask(
    planningId: string,
    taskId: string,
    updates: Partial<Task>
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      {
        _id: planningId as any,
        'tasks._id': taskId,
      },
      {
        $set: {
          'tasks.$': { ...updates, _id: taskId, updatedAt: new Date() },
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount > 0;
  }

  async removeTask(planningId: string, taskId: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: planningId as any },
      {
        $pull: { tasks: { _id: taskId } },
        $set: { updatedAt: new Date() },
      } as any
    );
    return result.modifiedCount > 0;
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const plannings = await this.collection
      .find({ 'tasks.status': status })
      .toArray();

    const tasks: Task[] = [];
    plannings.forEach((planning) => {
      planning.tasks?.forEach((task) => {
        if (task.status === status) {
          tasks.push(task);
        }
      });
    });

    return tasks;
  }
}
