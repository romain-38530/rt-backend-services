#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 4: Savings Plan Calculator
Calculates optimal Savings Plan commitment and projected savings
"""

import sys
import json
from datetime import datetime

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
HOURS_PER_MONTH = 730
HOURS_PER_YEAR = 8760

# Cost data (EUR)
CURRENT_MONTHLY_EC2_COST = 487.0  # Before optimizations
PHASE1_SAVINGS = 42.0  # EBS gp3 migration
PHASE2_SAVINGS = 85.0  # Stop dev instances
PHASE3_SAVINGS = 20.0  # ELB optimization
PHASE4A_SAVINGS = 90.0  # Instance downgrade

# Savings Plan discount rates
COMPUTE_SP_DISCOUNT = 0.40  # 40% average discount
EC2_INSTANCE_SP_DISCOUNT = 0.50  # 50% average discount

# Recommended coverage
RECOMMENDED_COVERAGE = 0.85  # 85% coverage, 15% flexible

def print_header(title):
    """Print formatted section header"""
    print("\n" + "=" * 80)
    print(f" {title}")
    print("=" * 80 + "\n")

def calculate_post_optimization_cost():
    """Calculate EC2 cost after all optimizations"""
    cost = CURRENT_MONTHLY_EC2_COST
    cost -= PHASE1_SAVINGS
    cost -= PHASE2_SAVINGS
    cost -= PHASE3_SAVINGS
    cost -= PHASE4A_SAVINGS
    return cost

def calculate_hourly_cost(monthly_cost):
    """Convert monthly cost to hourly"""
    return monthly_cost / HOURS_PER_MONTH

def calculate_commitment(hourly_cost, coverage):
    """Calculate recommended hourly commitment"""
    return hourly_cost * coverage

def calculate_savings_plan_benefit(commitment_hourly, discount_rate):
    """
    Calculate Savings Plan benefits
    Returns: (monthly_cost, monthly_savings, on_demand_equivalent)
    """
    # Monthly commitment cost
    monthly_commitment = commitment_hourly * HOURS_PER_MONTH

    # On-Demand equivalent (what you would pay without SP)
    on_demand_equivalent = monthly_commitment / (1 - discount_rate)

    # Monthly savings
    monthly_savings = on_demand_equivalent - monthly_commitment

    return monthly_commitment, monthly_savings, on_demand_equivalent

def print_cost_breakdown():
    """Print detailed cost breakdown"""
    print_header("Cost Analysis - Current Baseline")

    print(f"Initial EC2 Cost (before optimizations):     {CURRENT_MONTHLY_EC2_COST:>8.2f} EUR/month")
    print(f"  - Phase 1 (EBS gp3 migration):            -{PHASE1_SAVINGS:>8.2f} EUR/month")
    print(f"  - Phase 2 (Stop dev instances):           -{PHASE2_SAVINGS:>8.2f} EUR/month")
    print(f"  - Phase 3 (ELB optimization):             -{PHASE3_SAVINGS:>8.2f} EUR/month")
    print(f"  - Phase 4a (Instance downgrade):          -{PHASE4A_SAVINGS:>8.2f} EUR/month")
    print("-" * 80)

    post_opt_cost = calculate_post_optimization_cost()
    hourly_cost = calculate_hourly_cost(post_opt_cost)

    print(f"EC2 Cost after optimizations:                {post_opt_cost:>8.2f} EUR/month")
    print(f"Hourly cost:                                 {hourly_cost:>8.4f} EUR/hour")

    total_savings = PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + PHASE4A_SAVINGS
    reduction_pct = (total_savings / CURRENT_MONTHLY_EC2_COST) * 100

    print(f"\nTotal savings (Phases 1-4a):                 {total_savings:>8.2f} EUR/month")
    print(f"Cost reduction:                              {reduction_pct:>8.1f}%")

def print_savings_plan_option(name, discount_rate, commitment_hourly, post_opt_cost):
    """Print detailed Savings Plan option"""
    print(f"\n{name}")
    print("-" * 80)

    monthly_commitment, monthly_savings, on_demand_equiv = calculate_savings_plan_benefit(
        commitment_hourly, discount_rate
    )

    annual_commitment = monthly_commitment * 12
    annual_savings = monthly_savings * 12

    print(f"Hourly commitment:                           {commitment_hourly:>8.4f} EUR/hour")
    print(f"Monthly commitment:                          {monthly_commitment:>8.2f} EUR/month")
    print(f"Annual commitment:                         {annual_commitment:>10.2f} EUR/year")
    print(f"\nDiscount rate:                               {discount_rate*100:>8.1f}%")
    print(f"On-Demand equivalent cost:                   {on_demand_equiv:>8.2f} EUR/month")
    print(f"Monthly savings:                             {monthly_savings:>8.2f} EUR/month")
    print(f"Annual savings:                            {annual_savings:>10.2f} EUR/year")

    # Calculate utilization (how much of EC2 cost is covered)
    utilization = (monthly_commitment / post_opt_cost) * 100
    print(f"\nCoverage of EC2 cost:                        {utilization:>8.1f}%")

    # Remaining On-Demand cost
    remaining_on_demand = post_opt_cost - monthly_commitment
    if remaining_on_demand > 0:
        print(f"Remaining On-Demand cost:                    {remaining_on_demand:>8.2f} EUR/month")

    # Total EC2 cost with SP
    total_with_sp = monthly_commitment + max(0, remaining_on_demand)
    print(f"\nTotal EC2 cost with this SP:                 {total_with_sp:>8.2f} EUR/month")

    # Compare to original
    total_reduction = CURRENT_MONTHLY_EC2_COST - total_with_sp
    total_reduction_pct = (total_reduction / CURRENT_MONTHLY_EC2_COST) * 100
    print(f"Total reduction vs original:                 {total_reduction:>8.2f} EUR/month ({total_reduction_pct:.1f}%)")

    return monthly_savings

def compare_savings_plans():
    """Compare different Savings Plan options"""
    print_header("Savings Plan Options Comparison")

    post_opt_cost = calculate_post_optimization_cost()
    hourly_cost = calculate_hourly_cost(post_opt_cost)

    # Option 1: Compute Savings Plan (Recommended)
    commitment_compute = calculate_commitment(hourly_cost, RECOMMENDED_COVERAGE)
    savings_compute = print_savings_plan_option(
        "Option 1: Compute Savings Plan (RECOMMENDED)",
        COMPUTE_SP_DISCOUNT,
        commitment_compute,
        post_opt_cost
    )

    # Option 2: EC2 Instance Savings Plan
    commitment_ec2 = calculate_commitment(hourly_cost, RECOMMENDED_COVERAGE)
    savings_ec2 = print_savings_plan_option(
        "\nOption 2: EC2 Instance Savings Plan",
        EC2_INSTANCE_SP_DISCOUNT,
        commitment_ec2,
        post_opt_cost
    )

    # Option 3: No Savings Plan
    print(f"\n\nOption 3: No Savings Plan (Keep On-Demand)")
    print("-" * 80)
    print(f"Monthly cost:                                {post_opt_cost:>8.2f} EUR/month")
    print(f"Annual cost:                               {post_opt_cost*12:>10.2f} EUR/year")
    print(f"Savings:                                     {0:>8.2f} EUR/month (0%)")

    # Comparison summary
    print_header("Recommendation Summary")

    print("Compute Savings Plan vs EC2 Instance Savings Plan:")
    print(f"  Compute SP savings:                        {savings_compute:>8.2f} EUR/month")
    print(f"  EC2 Instance SP savings:                   {savings_ec2:>8.2f} EUR/month")
    print(f"  Difference:                                {savings_ec2-savings_compute:>8.2f} EUR/month")

    print("\nFlexibility comparison:")
    print("  Compute SP:        [OK] EC2, Fargate, Lambda | [OK] Any region | [OK] Any instance family")
    print("  EC2 Instance SP:   [OK] EC2 only             | [NO] Single region | [NO] Single family (t3)")

    print("\nRECOMMENDATION: Compute Savings Plan")
    print("  - Better flexibility for future optimizations")
    print("  - Covers Fargate and Lambda (future-proof)")
    print("  - Only {:.2f} EUR/month less savings than EC2 Instance SP".format(savings_ec2-savings_compute))
    print("  - Optimal risk/reward ratio")

def print_phase4_summary():
    """Print complete Phase 4 summary"""
    print_header("Phase 4 Complete Summary")

    post_opt_cost = calculate_post_optimization_cost()
    hourly_cost = calculate_hourly_cost(post_opt_cost)
    commitment = calculate_commitment(hourly_cost, RECOMMENDED_COVERAGE)

    monthly_commitment, monthly_savings, _ = calculate_savings_plan_benefit(
        commitment, COMPUTE_SP_DISCOUNT
    )

    print("Phase 4a: Instance Downgrade")
    print(f"  Action:       Downgrade 12× t3.small to t3.micro")
    print(f"  Savings:      {PHASE4A_SAVINGS:>8.2f} EUR/month ({PHASE4A_SAVINGS*12:>8.2f} EUR/year)")

    print("\nPhase 4b: Compute Savings Plan")
    print(f"  Type:         Compute Savings Plan")
    print(f"  Term:         1 year, No Upfront")
    print(f"  Commitment:   {commitment:.2f} EUR/hour ({monthly_commitment:.2f} EUR/month)")
    print(f"  Savings:      {monthly_savings:>8.2f} EUR/month ({monthly_savings*12:>8.2f} EUR/year)")

    total_phase4 = PHASE4A_SAVINGS + monthly_savings
    print(f"\nPhase 4 Total Savings:  {total_phase4:>8.2f} EUR/month ({total_phase4*12:>8.2f} EUR/year)")

    # Complete optimization summary
    total_all_phases = PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + total_phase4
    final_cost = CURRENT_MONTHLY_EC2_COST - total_all_phases
    reduction_pct = (total_all_phases / CURRENT_MONTHLY_EC2_COST) * 100

    print(f"\n" + "=" * 80)
    print("COMPLETE OPTIMIZATION SUMMARY (Phases 1-4)")
    print("=" * 80)
    print(f"Initial EC2 cost:                            {CURRENT_MONTHLY_EC2_COST:>8.2f} EUR/month")
    print(f"Total savings (all phases):                  {total_all_phases:>8.2f} EUR/month")
    print(f"Final EC2 cost:                              {final_cost:>8.2f} EUR/month")
    print(f"Total reduction:                             {reduction_pct:>8.1f}%")
    print(f"\nAnnual savings:                            {total_all_phases*12:>10.2f} EUR/year")

def export_results():
    """Export results to JSON file"""
    post_opt_cost = calculate_post_optimization_cost()
    hourly_cost = calculate_hourly_cost(post_opt_cost)
    commitment = calculate_commitment(hourly_cost, RECOMMENDED_COVERAGE)

    monthly_commitment, monthly_savings, on_demand_equiv = calculate_savings_plan_benefit(
        commitment, COMPUTE_SP_DISCOUNT
    )

    results = {
        "analysis_date": datetime.utcnow().isoformat(),
        "baseline": {
            "initial_monthly_cost_eur": CURRENT_MONTHLY_EC2_COST,
            "post_optimization_monthly_cost_eur": post_opt_cost,
            "post_optimization_hourly_cost_eur": hourly_cost
        },
        "phase_savings": {
            "phase1_ebs_gp3_eur_month": PHASE1_SAVINGS,
            "phase2_stop_dev_eur_month": PHASE2_SAVINGS,
            "phase3_elb_optimization_eur_month": PHASE3_SAVINGS,
            "phase4a_instance_downgrade_eur_month": PHASE4A_SAVINGS,
            "total_phases_1_to_4a_eur_month": PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + PHASE4A_SAVINGS
        },
        "recommended_savings_plan": {
            "type": "Compute Savings Plan",
            "term_years": 1,
            "payment_option": "No Upfront",
            "hourly_commitment_eur": round(commitment, 4),
            "monthly_commitment_eur": round(monthly_commitment, 2),
            "annual_commitment_eur": round(monthly_commitment * 12, 2),
            "discount_rate": COMPUTE_SP_DISCOUNT,
            "on_demand_equivalent_eur_month": round(on_demand_equiv, 2),
            "monthly_savings_eur": round(monthly_savings, 2),
            "annual_savings_eur": round(monthly_savings * 12, 2),
            "coverage_percentage": RECOMMENDED_COVERAGE * 100
        },
        "phase4_total": {
            "phase4a_downgrade_eur_month": PHASE4A_SAVINGS,
            "phase4b_savings_plan_eur_month": round(monthly_savings, 2),
            "total_phase4_eur_month": round(PHASE4A_SAVINGS + monthly_savings, 2),
            "total_phase4_eur_year": round((PHASE4A_SAVINGS + monthly_savings) * 12, 2)
        },
        "complete_optimization": {
            "total_monthly_savings_eur": round(
                PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + PHASE4A_SAVINGS + monthly_savings, 2
            ),
            "total_annual_savings_eur": round(
                (PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + PHASE4A_SAVINGS + monthly_savings) * 12, 2
            ),
            "final_monthly_cost_eur": round(
                CURRENT_MONTHLY_EC2_COST - (PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + PHASE4A_SAVINGS + monthly_savings), 2
            ),
            "cost_reduction_percentage": round(
                ((PHASE1_SAVINGS + PHASE2_SAVINGS + PHASE3_SAVINGS + PHASE4A_SAVINGS + monthly_savings) / CURRENT_MONTHLY_EC2_COST) * 100, 1
            )
        }
    }

    output_file = "savings-plan-calculation.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n[OK] Detailed calculations saved to: {output_file}")

def main():
    """Main execution"""
    print("\n" + "=" * 80)
    print(" Phase 4: Savings Plan Calculator")
    print(" AWS Cost Optimization - RT Backend Services")
    print("=" * 80)

    # Cost breakdown
    print_cost_breakdown()

    # Savings Plan comparison
    compare_savings_plans()

    # Phase 4 summary
    print_phase4_summary()

    # Export results
    export_results()

    print("\n" + "=" * 80)
    print(" Next steps:")
    print("   1. Review the recommendation above")
    print("   2. Execute Phase 4a (downgrade) first")
    print("   3. Validate costs after 48h")
    print("   4. Purchase Compute Savings Plan via AWS Console")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    main()
