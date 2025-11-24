// @ts-nocheck
import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from '@rt/data-mongo';
import {
  Contract,
  ContractTemplate,
  Signature,
  SigningWorkflow,
  ContractAuditLog,
  ContractStatus,
  SignatureStatus,
  ContractType,
} from '@rt/contracts';

export class ContractRepository {
  private db = getDatabase();

  // Contract Templates
  async createTemplate(template: Omit<ContractTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContractTemplate> {
    const collection = this.db.collection<ContractTemplate>('contract_templates');
    const now = new Date();
    const doc = {
      ...template,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getTemplateById(id: string): Promise<ContractTemplate | null> {
    const collection = this.db.collection<ContractTemplate>('contract_templates');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getTemplatesByType(type: ContractType): Promise<ContractTemplate[]> {
    const collection = this.db.collection<ContractTemplate>('contract_templates');
    const docs = await collection.find({ type, isActive: true }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getAllTemplates(activeOnly = true): Promise<ContractTemplate[]> {
    const collection = this.db.collection<ContractTemplate>('contract_templates');
    const query = activeOnly ? { isActive: true } : {};
    const docs = await collection.find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async updateTemplate(id: string, updates: Partial<ContractTemplate>): Promise<ContractTemplate | null> {
    const collection = this.db.collection<ContractTemplate>('contract_templates');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async deactivateTemplate(id: string): Promise<boolean> {
    const collection = this.db.collection<ContractTemplate>('contract_templates');
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  // Contracts
  async createContract(contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt' | 'contractNumber'>): Promise<Contract> {
    const collection = this.db.collection<Contract>('contracts');
    const now = new Date();

    // Generate contract number
    const count = await collection.countDocuments();
    const contractNumber = `CTR-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const doc = {
      ...contract,
      contractNumber,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getContractById(id: string): Promise<Contract | null> {
    const collection = this.db.collection<Contract>('contracts');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getContractByNumber(contractNumber: string): Promise<Contract | null> {
    const collection = this.db.collection<Contract>('contracts');
    const doc = await collection.findOne({ contractNumber });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getContractsByUserId(userId: string): Promise<Contract[]> {
    const collection = this.db.collection<Contract>('contracts');
    const docs = await collection.find({ createdBy: userId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getContractsByPartyEmail(email: string): Promise<Contract[]> {
    const collection = this.db.collection<Contract>('contracts');
    const docs = await collection.find({
      'parties.email': email,
    }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getContractsByStatus(status: ContractStatus): Promise<Contract[]> {
    const collection = this.db.collection<Contract>('contracts');
    const docs = await collection.find({ status }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async updateContract(id: string, updates: Partial<Contract>): Promise<Contract | null> {
    const collection = this.db.collection<Contract>('contracts');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async getExpiringContracts(beforeDate: Date): Promise<Contract[]> {
    const collection = this.db.collection<Contract>('contracts');
    const docs = await collection.find({
      status: { $in: [ContractStatus.FULLY_SIGNED, ContractStatus.PARTIALLY_SIGNED] },
      expirationDate: { $lte: beforeDate },
    }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  // Signatures
  async createSignature(signature: Omit<Signature, 'id' | 'createdAt' | 'updatedAt'>): Promise<Signature> {
    const collection = this.db.collection<Signature>('signatures');
    const now = new Date();
    const doc = {
      ...signature,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getSignatureById(id: string): Promise<Signature | null> {
    const collection = this.db.collection<Signature>('signatures');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getSignaturesByContractId(contractId: string): Promise<Signature[]> {
    const collection = this.db.collection<Signature>('signatures');
    const docs = await collection.find({ contractId }).sort({ createdAt: 1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getSignaturesByWorkflowId(workflowId: string): Promise<Signature[]> {
    const collection = this.db.collection<Signature>('signatures');
    const docs = await collection.find({ workflowId }).sort({ createdAt: 1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getSignatureByEmail(contractId: string, email: string): Promise<Signature | null> {
    const collection = this.db.collection<Signature>('signatures');
    const doc = await collection.findOne({ contractId, signerEmail: email });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async updateSignature(id: string, updates: Partial<Signature>): Promise<Signature | null> {
    const collection = this.db.collection<Signature>('signatures');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async getPendingSignatures(expiringBefore?: Date): Promise<Signature[]> {
    const collection = this.db.collection<Signature>('signatures');
    const query: any = { status: SignatureStatus.PENDING };

    if (expiringBefore) {
      query.expiresAt = { $lte: expiringBefore };
    }

    const docs = await collection.find(query).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  // Signing Workflows
  async createWorkflow(workflow: Omit<SigningWorkflow, 'id' | 'createdAt' | 'updatedAt'>): Promise<SigningWorkflow> {
    const collection = this.db.collection<SigningWorkflow>('signing_workflows');
    const now = new Date();
    const doc = {
      ...workflow,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getWorkflowById(id: string): Promise<SigningWorkflow | null> {
    const collection = this.db.collection<SigningWorkflow>('signing_workflows');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getWorkflowByContractId(contractId: string): Promise<SigningWorkflow | null> {
    const collection = this.db.collection<SigningWorkflow>('signing_workflows');
    const doc = await collection.findOne({ contractId });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async updateWorkflow(id: string, updates: Partial<SigningWorkflow>): Promise<SigningWorkflow | null> {
    const collection = this.db.collection<SigningWorkflow>('signing_workflows');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async getInProgressWorkflows(): Promise<SigningWorkflow[]> {
    const collection = this.db.collection<SigningWorkflow>('signing_workflows');
    const docs = await collection.find({
      status: 'IN_PROGRESS',
    }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  // Audit Logs
  async createAuditLog(log: Omit<ContractAuditLog, 'id' | 'createdAt' | 'updatedAt' | 'timestamp'>): Promise<ContractAuditLog> {
    const collection = this.db.collection<ContractAuditLog>('contract_audit_logs');
    const now = new Date();
    const doc = {
      ...log,
      timestamp: now,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getAuditLogsByContractId(contractId: string): Promise<ContractAuditLog[]> {
    const collection = this.db.collection<ContractAuditLog>('contract_audit_logs');
    const docs = await collection.find({ contractId }).sort({ timestamp: 1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getAuditLogsByActor(actor: string, limit = 100): Promise<ContractAuditLog[]> {
    const collection = this.db.collection<ContractAuditLog>('contract_audit_logs');
    const docs = await collection
      .find({ actor })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }
}

export const contractRepository = new ContractRepository();
