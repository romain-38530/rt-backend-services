/**
 * Module de métriques personnalisées CloudWatch pour SYMPHONI.A
 * Fichier de déclaration TypeScript
 */

import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { Request, Response, NextFunction } from "express";

export interface CloudWatchMetricsOptions {
  region?: string;
  namespace?: string;
  enabled?: boolean;
  bufferSize?: number;
  flushInterval?: number;
}

export interface MetricDimensions {
  [key: string]: string;
}

export declare class CloudWatchMetrics {
  constructor(options?: CloudWatchMetricsOptions);

  region: string;
  namespace: string;
  client: CloudWatchClient;
  enabled: boolean;
  bufferSize: number;
  flushInterval: number;
  buffer: any[];
  flushTimer?: NodeJS.Timeout;

  /**
   * Démarre l'envoi automatique périodique des métriques
   */
  startAutoFlush(): void;

  /**
   * Arrête l'envoi automatique des métriques
   */
  stopAutoFlush(): void;

  /**
   * Envoie une métrique à CloudWatch
   */
  sendMetric(
    metricName: string,
    value: number,
    unit?: string,
    dimensions?: MetricDimensions,
    timestamp?: Date
  ): Promise<void>;

  /**
   * Envoie toutes les métriques en buffer à CloudWatch
   */
  flush(): Promise<void>;

  /**
   * Envoie une métrique de compteur (incrémente)
   */
  incrementCounter(metricName: string, dimensions?: MetricDimensions): Promise<void>;

  /**
   * Envoie une métrique de durée en millisecondes
   */
  recordDuration(metricName: string, durationMs: number, dimensions?: MetricDimensions): Promise<void>;

  /**
   * Envoie une métrique de taille en bytes
   */
  recordSize(metricName: string, sizeBytes: number, dimensions?: MetricDimensions): Promise<void>;

  /**
   * Wrapper pour mesurer automatiquement le temps d'exécution d'une fonction
   */
  measureExecutionTime<T>(
    metricName: string,
    fn: () => T | Promise<T>,
    dimensions?: MetricDimensions
  ): Promise<T>;

  /**
   * Nettoie les ressources
   */
  dispose(): Promise<void>;
}

export declare class TMSSyncMetrics extends CloudWatchMetrics {
  constructor(options?: CloudWatchMetricsOptions);

  /**
   * Enregistre une synchronisation réussie
   */
  recordSyncSuccess(duration: number, itemCount?: number): Promise<void>;

  /**
   * Enregistre une synchronisation échouée
   */
  recordSyncFailure(duration: number, errorType?: string): Promise<void>;

  /**
   * Enregistre un appel API
   */
  recordAPICall(endpoint: string, duration: number, statusCode: number): Promise<void>;
}

export declare class AffretIAMetrics extends CloudWatchMetrics {
  constructor(options?: CloudWatchMetricsOptions);

  /**
   * Enregistre une requête IA
   */
  recordAIRequest(processingTime: number, success?: boolean): Promise<void>;

  /**
   * Enregistre un résultat de matching
   */
  recordMatchingResult(matchCount: number, processingTime: number): Promise<void>;

  /**
   * Enregistre l'envoi d'un email
   */
  recordEmailSent(recipientCount: number, success?: boolean): Promise<void>;

  /**
   * Enregistre un appel au fournisseur IA
   */
  recordAIProviderCall(provider: string, duration: number, success?: boolean): Promise<void>;
}

/**
 * Middleware Express pour enregistrer automatiquement les métriques de requêtes HTTP
 */
export declare function createMetricsMiddleware(
  serviceName: string,
  metricsInstance?: CloudWatchMetrics
): (req: Request, res: Response, next: NextFunction) => void;
