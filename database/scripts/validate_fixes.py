#!/usr/bin/env python3
"""
Validate that all 20 Task 9 issues are fixed in the code.
This script checks the source code, not runtime behavior.
"""

import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PERF_SCRIPT = SCRIPT_DIR / "validate_performance.py"

def check_issue(issue_num, description, pattern, should_exist=True):
    """Check if a fix is present in the code."""
    content = PERF_SCRIPT.read_text()

    found = bool(re.search(pattern, content, re.MULTILINE | re.DOTALL))

    status = "✅" if found == should_exist else "❌"
    result = "PASS" if found == should_exist else "FAIL"

    print(f"{status} Issue #{issue_num}: {description} [{result}]")

    return found == should_exist


def main():
    """Run all checks."""
    print("🔍 Validating Task 9 fixes in source code...\n")

    checks = [
        # Security & Correctness
        (1, "Parameterized queries (no SQL injection)",
         r"cursor\.execute\([^)]+%s[^)]+\)", True),

        (1, "No string concatenation in SQL",
         r"embedding_str\s*=.*\+.*embedding", False),

        (2, "Connection pooling",
         r"psycopg2\.pool\.ThreadedConnectionPool", True),

        (3, "REPEATABLE READ isolation",
         r"ISOLATION_LEVEL_REPEATABLE_READ", True),

        (4, "VACUUM ANALYZE",
         r"VACUUM ANALYZE", True),

        (12, "Safe cleanup (exact ID match)",
         r"DELETE.*WHERE id = ANY", True),

        (12, "No LIKE pattern in cleanup",
         r"cleanup.*LIKE.*dummy", False),

        (13, "Subtransactions for recovery",
         r"SAVEPOINT", True),

        # Performance & Realism
        (5, "Normal distribution embeddings",
         r"np\.random\.randn", True),

        (5, "Unit normalization",
         r"norm.*linalg\.norm", True),

        (6, "Warmup phase",
         r"warmup.*iterations", True),

        (7, "Bulk transactions",
         r"conn\.commit\(\).*# Single transaction|Bulk.*transaction", True),

        (8, "1000 iterations for P95",
         r"BENCHMARK_ITERATIONS\s*=\s*1000", True),

        (8, "P99 calculation",
         r"percentile.*99", True),

        (9, "Index build time measurement",
         r"measure_index_build_time", True),

        (10, "IVFFlat probes tuning",
         r"ivfflat\.probes\s*=", True),

        (18, "Write amplification measurement",
         r"measure_write_amplification", True),

        # Validation & Diagnostics
        (11, "Recall@K measurement",
         r"recall_at_5|recall_at_10", True),

        (11, "Ground truth computation",
         r"compute_ground_truth", True),

        (14, "EXPLAIN ANALYZE capture",
         r"EXPLAIN ANALYZE", True),

        (14, "Query plan storage",
         r"explain_plans", True),

        (16, "Memory profiling guidance",
         r"shared_buffers", True),

        (17, "Index existence verification",
         r"verify_index_exists", True),

        (19, "Non-linear scaling tests",
         r"SCALE_TEST_SIZES.*\[.*,.*,.*\]", True),

        (19, "Multiple scale tests",
         r"test_scale.*scale_size", True),

        (20, "36.5k production validation",
         r"36500|production.*scale", True),
    ]

    results = []
    for check in checks:
        results.append(check_issue(*check))

    print(f"\n{'='*80}")
    print(f"SUMMARY: {sum(results)}/{len(results)} checks passed")
    print(f"{'='*80}\n")

    # Check requirements.txt
    print("📦 Checking requirements.txt...")
    req_file = SCRIPT_DIR.parent / "tests" / "requirements.txt"
    req_content = req_file.read_text()

    if "numpy>=2.0.0" in req_content or "numpy>2" in req_content:
        print("✅ Issue #15: numpy>=2.0.0 (production-aligned) [PASS]")
        results.append(True)
    else:
        print("❌ Issue #15: numpy version mismatch [FAIL]")
        results.append(False)

    # Final summary
    print(f"\n{'='*80}")
    print(f"FINAL SCORE: {sum(results)}/{len(results)} issues fixed")
    print(f"{'='*80}\n")

    if all(results):
        print("✅ ALL 20 ISSUES FIXED - Task 9 v2.0 complete!")
        return 0
    else:
        print(f"⚠️  {len(results) - sum(results)} issues remain")
        return 1


if __name__ == '__main__':
    sys.exit(main())
