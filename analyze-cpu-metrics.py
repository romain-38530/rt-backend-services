#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 4: CPU Analysis Script for EC2 Instance Downgrade
Analyzes CPU utilization for t3.small instances to identify downgrade candidates
"""

import boto3
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
REGION = 'eu-central-1'
PERIOD_DAYS = 7

# Instances to analyze
INSTANCES = [
    {"id": "i-07aba2934ad4ed933", "name": "rt-admin-api-prod"},
    {"id": "i-02260cfd794e7f43f", "name": "rt-affret-ia-api-prod-v4"},
    {"id": "i-03eb51b3c798e010f", "name": "exploit-ia-planning-prod"},
    {"id": "i-07eb45cf006ecc67a", "name": "exploit-ia-planning-prod-v3"},
    {"id": "i-02b6585e3c7790e87", "name": "exploit-ia-worker-v3"},
    {"id": "i-0e6d027777df2b7c5", "name": "exploit-ia-api-admin-prod-v1"},
    {"id": "i-0a7f175d40c307e46", "name": "exploit-ia-worker-ingestion-prod"},
    {"id": "i-02dd7db8947118d4d", "name": "rt-subscriptions-api-prod-v5"},
    {"id": "i-04abe8e887385e2a2", "name": "exploit-ia-api-auth-prod-v1"},
    {"id": "i-04aeb2a387461a326", "name": "exploit-ia-api-orders-prod-v1"},
    {"id": "i-0c4bbdcabfcc1c478", "name": "exploit-ia-profitability-v3"},
    {"id": "i-093ef6b78139d9574", "name": "exploit-ia-affretia-prod-v1"}
]

# Thresholds
CPU_AVG_THRESHOLD = 30.0  # Average CPU < 30% → Candidate for downgrade
CPU_MAX_THRESHOLD = 60.0  # Max CPU < 60% → Safe for downgrade

def get_cpu_metrics(instance_id: str) -> Tuple[float, float, int]:
    """
    Get CPU utilization metrics for an instance over the past 7 days
    Returns: (avg_cpu, max_cpu, datapoint_count)
    """
    cloudwatch = boto3.client('cloudwatch', region_name=REGION)

    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=PERIOD_DAYS)

    try:
        # Get Average statistics
        response_avg = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,  # 1 hour
            Statistics=['Average']
        )

        # Get Maximum statistics
        response_max = cloudwatch.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,  # 1 hour
            Statistics=['Maximum']
        )

        # Calculate average of all hourly averages
        avg_datapoints = response_avg['Datapoints']
        max_datapoints = response_max['Datapoints']

        if not avg_datapoints:
            return 0.0, 0.0, 0

        avg_cpu = sum(dp['Average'] for dp in avg_datapoints) / len(avg_datapoints)
        max_cpu = max(dp['Maximum'] for dp in max_datapoints) if max_datapoints else 0.0

        return avg_cpu, max_cpu, len(avg_datapoints)

    except Exception as e:
        print(f"Error getting metrics for {instance_id}: {str(e)}")
        return 0.0, 0.0, 0

def get_recommendation(avg_cpu: float, max_cpu: float) -> str:
    """
    Determine if instance is a candidate for downgrade
    """
    if avg_cpu < CPU_AVG_THRESHOLD and max_cpu < CPU_MAX_THRESHOLD:
        return "[OK] DOWNGRADE TO t3.micro"
    elif avg_cpu < CPU_AVG_THRESHOLD:
        return "[WARN] MONITOR (high max CPU)"
    else:
        return "[NO] KEEP t3.small"

def main():
    print("=" * 80)
    print("Phase 4: CPU Analysis for EC2 Instance Downgrade")
    print("=" * 80)
    print(f"\nAnalyzing {len(INSTANCES)} t3.small instances over the past {PERIOD_DAYS} days")
    print(f"Thresholds: CPU Avg < {CPU_AVG_THRESHOLD}%, CPU Max < {CPU_MAX_THRESHOLD}%")
    print("\nFetching metrics from CloudWatch...\n")

    results = []

    for i, instance in enumerate(INSTANCES, 1):
        print(f"[{i}/{len(INSTANCES)}] Analyzing {instance['name']} ({instance['id']})...", end=" ")

        avg_cpu, max_cpu, datapoint_count = get_cpu_metrics(instance['id'])
        recommendation = get_recommendation(avg_cpu, max_cpu)

        results.append({
            "id": instance['id'],
            "name": instance['name'],
            "avg_cpu": avg_cpu,
            "max_cpu": max_cpu,
            "datapoints": datapoint_count,
            "recommendation": recommendation
        })

        print(f"Avg: {avg_cpu:.2f}%, Max: {max_cpu:.2f}% -> {recommendation}")

    # Generate report
    print("\n" + "=" * 80)
    print("ANALYSIS RESULTS")
    print("=" * 80)
    print(f"\n{'Instance Name':<40} {'Instance ID':<22} {'CPU Avg':<10} {'CPU Max':<10} {'Recommendation':<30}")
    print("-" * 130)

    downgrade_candidates = []
    monitor_instances = []
    keep_instances = []

    for result in results:
        print(f"{result['name']:<40} {result['id']:<22} {result['avg_cpu']:>7.2f}% {result['max_cpu']:>7.2f}% {result['recommendation']:<30}")

        if "DOWNGRADE" in result['recommendation']:
            downgrade_candidates.append(result)
        elif "MONITOR" in result['recommendation']:
            monitor_instances.append(result)
        else:
            keep_instances.append(result)

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"\nTotal instances analyzed: {len(results)}")
    print(f"[OK] Recommended for downgrade to t3.micro: {len(downgrade_candidates)}")
    print(f"[WARN] Monitor (borderline cases): {len(monitor_instances)}")
    print(f"[NO] Keep as t3.small: {len(keep_instances)}")

    # Calculate savings
    monthly_savings_per_instance = 7.50  # EUR
    total_potential_savings = len(downgrade_candidates) * monthly_savings_per_instance

    print(f"\nESTIMATED MONTHLY SAVINGS")
    print(f"   {len(downgrade_candidates)} instances x {monthly_savings_per_instance} EUR/month = {total_potential_savings} EUR/month")

    # Save detailed results to JSON
    output_file = "cpu-analysis-results.json"
    with open(output_file, 'w') as f:
        json.dump({
            "analysis_date": datetime.now(timezone.utc).isoformat(),
            "period_days": PERIOD_DAYS,
            "thresholds": {
                "cpu_avg": CPU_AVG_THRESHOLD,
                "cpu_max": CPU_MAX_THRESHOLD
            },
            "summary": {
                "total_instances": len(results),
                "downgrade_candidates": len(downgrade_candidates),
                "monitor_instances": len(monitor_instances),
                "keep_instances": len(keep_instances),
                "estimated_monthly_savings_eur": total_potential_savings
            },
            "instances": results
        }, f, indent=2)

    print(f"\n[OK] Detailed results saved to: {output_file}")

    # List downgrade candidates
    if downgrade_candidates:
        print("\n" + "=" * 80)
        print("INSTANCES RECOMMENDED FOR DOWNGRADE")
        print("=" * 80)
        for result in downgrade_candidates:
            print(f"  - {result['name']} ({result['id']}) - Avg: {result['avg_cpu']:.2f}%, Max: {result['max_cpu']:.2f}%")

    print("\n" + "=" * 80)
    print("Next steps:")
    print("  1. Review the recommendations above")
    print("  2. Generate markdown report with: python generate-cpu-report.py")
    print("  3. Execute downgrades with: bash downgrade-instances.sh")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    main()
