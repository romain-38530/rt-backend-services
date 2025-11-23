import { ApiErrorCode } from '../enums/index.js';

// Base Entity
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, any>;
  field?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Geo Location
export interface GeoLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
  region?: string;
  location?: GeoLocation;
}

// Contact Info
export interface ContactInfo {
  name: string;
  phone: string;
  email?: string;
}

// Time Range
export interface TimeRange {
  start: Date;
  end: Date;
}

// File Upload
export interface FileMetadata {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedAt: Date;
  uploadedBy: string;
}
