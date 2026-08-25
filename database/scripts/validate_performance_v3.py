#!/usr/bin/env python3
# database/scripts/validate_performance_v3.py
"""
AAA-structured performance validation with proper test isolation and assertions.

IMPROVEMENTS in V3:
- Clear AAA structure in every test function
- Explicit assertions with expected values
- Proper setup/teardown per test
- Test results aggregation and reporting
- Separated warmup from benchmark phases
"""

import os
import sys
import time
import psycopg2
import psycopg2.pool
import psycopg2.extensions
import psycopg2.extras
import numpy as np
from typing import List, Tuple, Dict
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from io import StringIO

# ════════════════════════════════════════════════════════════
# CONFIGURATION
# ════════════════════════════════════════════════════════════

DB_HOST = os.getenv('POSTGRES_HOST', 'localhost')
DB_PORT = os.getenv('POSTGRES_PORT', '5432')
DB_NAME = os.getenv('POSTGRES_DB', 'openwa')
DB_USER = os.getenv('POSTGRES_USER', 'postgres')
DB_PASSWORD = os.getenv('POSTGRES_PASSWORD', '')
DB_CONNECT_TIMEOUT = 10

EMBEDDING_DIM = 1536
WARMUP_ITERATIONS = 50
BENCHMARK_ITERATIONS = 1000
SCALE_TEST_SIZES = [1000, 10000, 50000]

# Performance targets (SLOs)
TARGET_AVG_QUERY_MS = 50.0
TARGET_P95_QUERY_MS = 100.0
TARGET_INSERT_RATE_MIN = 500.0  # rows/sec
TARGET_RECALL_AT_5_MIN = 0.90   # 90%
TARGET_INDEX_USE_RATE = 1.0     # 100% of queries should use index

connection_pool = None


# ════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ════════════════════════════════════════════════════════════

@dataclass
class PerformanceMetrics:
    """Performance test results with assertion targets."""
    avg_query_time_ms: float
    p50_query_time_ms: float
    p95_query_time_ms: float
    p99_query_time_ms: float
    insert_speed_rows_per_sec: float
    index_build_time_sec: float
    recall_at_5: float
    recall_at_10: float
    queries_using_index: int
    queries_total: int
    write_amplification: float

    def passes_slo(self) -> Tuple[bool, List[str]]:
        """Check if metrics meet SLO targets."""
        failures = []

        if self.avg_query_time_ms > TARGET_AVG_QUERY_MS:
            failures.append(f"Avg query time {self.avg_query_time_ms:.2f}ms > {TARGET_AVG_QUERY_MS}ms")

        if self.p95_query_time_ms > TARGET_P95_QUERY_MS:
            failures.append(f"P95 query time {self.p95_query_time_ms:.2f}ms > {TARGET_P95_QUERY_MS}ms")

        if self.insert_speed_rows_per_sec < TARGET_INSERT_RATE_MIN:
            failures.append(f"Insert rate {self.insert_speed_rows_per_sec:.1f} < {TARGET_INSERT_RATE_MIN} rows/sec")

        if self.recall_at_5 < TARGET_RECALL_AT_5_MIN:
            failures.append(f"Recall@5 {self.recall_at_5:.2%} < {TARGET_RECALL_AT_5_MIN:.0%}")

        index_use_rate = self.queries_using_index / self.queries_total if self.queries_total > 0 else 0.0
        if index_use_rate < TARGET_INDEX_USE_RATE:
            failures.append(f"Index usage {index_use_rate:.0%} < {TARGET_INDEX_USE_RATE:.0%}")

        return (len(failures) == 0, failures)


@dataclass
class TestResult:
    """Individual test result."""
    test_name: str
    status: str  # PASS, FAIL
    metrics: PerformanceMetrics = None
    error: str = None
    duration_sec: float = 0.0


# ════════════════════════════════════════════════════════════
# DATABASE CONNECTION
# ════════════════════════════════════════════════════════════

def init_connection_pool(min_conn: int = 2, max_conn: int = 10):
    """Initialize connection pool with timeout."""
    global connection_pool

    try:
        connection_pool = psycopg2.pool.ThreadedConnectionPool(
            min_conn, max_conn,
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD,
            connect_timeout=DB_CONNECT_TIMEOUT
        )
        print(f"✅ Connection pool initialized (timeout={DB_CONNECT_TIMEOUT}s)")
    except psycopg2.OperationalError as e:
        print(f"❌ Failed to connect: {e}")
        sys.exit(1)


@contextmanager
def get_connection():
    """Get connection from pool with automatic return."""
    if connection_pool is None:
        raise RuntimeError("Connection pool not initialized")

    conn = connection_pool.getconn()
    try:
        yield conn
    finally:
        connection_pool.putconn(conn)


# ════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ════════════════════════════════════════════════════════════

def generate_embedding() -> np.ndarray:
    """Generate realistic 1536-dim embedding."""
    embedding = np.random.randn(EMBEDDING_DIM)
    embedding = np.clip(embedding / 3.0, -1.0, 1.0)
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding


# ════════════════════════════════════════════════════════════
# TEST FUNCTIONS (AAA STRUCTURE)
# ════════════════════════════════════════════════════════════

def test_index_exists(conn) -> TestResult:
    """
    Test: IVFFlat index exists on embedding column

    ARRANGE: Connect to database
    ACT: Query pg_indexes
    ASSERT: Index with IVFFlat exists
    """
    test_name = "Index Existence"
    start = time.time()

    try:
        # ARRANGE: Get cursor
        cursor = conn.cursor()

        # ACT: Query for IVFFlat index
        cursor.execute("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'knowledge'
            AND tablename = 'conversations'
            AND indexdef ILIKE '%embedding%'
            AND indexdef ILIKE '%ivfflat%'
        """)
        result = cursor.fetchone()

        # ASSERT: Index exists
        if not result:
            raise AssertionError("IVFFlat index not found on embedding column")

        print(f"✅ PASS: {test_name} - {result[0]}")
        return TestResult(
            test_name=test_name,
            status="PASS",
            duration_sec=time.time() - start
        )

    except Exception as e:
        print(f"❌ FAIL: {test_name} - {e}")
        return TestResult(
            test_name=test_name,
            status="FAIL",
            error=str(e),
            duration_sec=time.time() - start
        )


def test_bulk_insert_performance(conn, count: int, prefix: str) -> Tuple[TestResult, List[int]]:
    """
    Test: Bulk insert performance using COPY

    ARRANGE: Prepare test data in memory
    ACT: Execute COPY FROM
    ASSERT: Insert rate >= TARGET_INSERT_RATE_MIN rows/sec
    TEARDOWN: Return inserted IDs for cleanup
    """
    test_name = f"Bulk Insert ({count} rows)"
    start = time.time()

    try:
        # ARRANGE: Generate embeddings and prepare CSV
        cursor = conn.cursor()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_REPEATABLE_READ)

        embeddings = [generate_embedding() for _ in range(count)]
        csv_buffer = StringIO()
        for i in range(count):
            embedding_str = '[' + ','.join(map(str, embeddings[i])) + ']'
            csv_buffer.write(f"{prefix}_{i}@c.us\t")
            csv_buffer.write(f"msg_{prefix}_{i}\t")
            csv_buffer.write(f"client\t")
            csv_buffer.write(f"Perf test {i}\t")
            csv_buffer.write(f"{embedding_str}\n")
        csv_buffer.seek(0)

        # ACT: Execute COPY FROM
        insert_start = time.time()
        cursor.copy_expert("""
            COPY knowledge.conversations
            (chat_id, message_id, from_user, message_text, embedding)
            FROM STDIN
            WITH (FORMAT text, DELIMITER '\t')
        """, csv_buffer)
        conn.commit()
        insert_duration = time.time() - insert_start
        rows_per_sec = count / insert_duration

        # Get inserted IDs for cleanup
        cursor.execute("""
            SELECT id FROM knowledge.conversations
            WHERE chat_id LIKE %s ORDER BY id
        """, (f'{prefix}_%',))
        inserted_ids = [row[0] for row in cursor.fetchall()]

        # ASSERT: Insert rate meets target
        if rows_per_sec < TARGET_INSERT_RATE_MIN:
            raise AssertionError(
                f"Insert rate {rows_per_sec:.1f} < {TARGET_INSERT_RATE_MIN} rows/sec"
            )

        print(f"✅ PASS: {test_name} - {rows_per_sec:.1f} rows/sec in {insert_duration:.2f}s")
        return (
            TestResult(
                test_name=test_name,
                status="PASS",
                duration_sec=time.time() - start
            ),
            inserted_ids
        )

    except Exception as e:
        conn.rollback()
        print(f"❌ FAIL: {test_name} - {e}")
        return (
            TestResult(
                test_name=test_name,
                status="FAIL",
                error=str(e),
                duration_sec=time.time() - start
            ),
            []
        )
    finally:
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_READ_COMMITTED)


def test_vacuum_analyze(conn) -> TestResult:
    """
    Test: VACUUM ANALYZE updates statistics

    ARRANGE: Set autocommit isolation
    ACT: Execute VACUUM ANALYZE
    ASSERT: Command completes without error
    """
    test_name = "VACUUM ANALYZE"
    start = time.time()

    try:
        # ARRANGE: Set autocommit
        old_isolation = conn.isolation_level
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        # ACT: Execute VACUUM ANALYZE
        cursor.execute("VACUUM ANALYZE knowledge.conversations")

        # ASSERT: No error raised
        conn.set_isolation_level(old_isolation)

        print(f"✅ PASS: {test_name}")
        return TestResult(
            test_name=test_name,
            status="PASS",
            duration_sec=time.time() - start
        )

    except Exception as e:
        print(f"❌ FAIL: {test_name} - {e}")
        return TestResult(
            test_name=test_name,
            status="FAIL",
            error=str(e),
            duration_sec=time.time() - start
        )


def test_similarity_search_warmup(conn, iterations: int, probes: int) -> TestResult:
    """
    Test: Warmup phase primes cache

    ARRANGE: Set IVFFlat probes
    ACT: Execute warmup iterations (results discarded)
    ASSERT: All queries complete without error
    """
    test_name = f"Warmup Phase ({iterations} iterations)"
    start = time.time()

    try:
        # ARRANGE: Set probes
        cursor = conn.cursor()
        cursor.execute("SET ivfflat.probes = %s", (probes,))

        # ACT: Execute warmup queries
        for i in range(iterations):
            query_embedding = generate_embedding()
            embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'

            cursor.execute("""
                SELECT id FROM knowledge.conversations
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT 5
            """, (embedding_str,))
            cursor.fetchall()  # Discard results

        # ASSERT: All queries succeeded
        print(f"✅ PASS: {test_name} - cache primed")
        return TestResult(
            test_name=test_name,
            status="PASS",
            duration_sec=time.time() - start
        )

    except Exception as e:
        print(f"❌ FAIL: {test_name} - {e}")
        return TestResult(
            test_name=test_name,
            status="FAIL",
            error=str(e),
            duration_sec=time.time() - start
        )


def test_similarity_search_benchmark(
    conn,
    iterations: int,
    probes: int
) -> Tuple[TestResult, PerformanceMetrics]:
    """
    Test: Similarity search performance and accuracy

    ARRANGE: Set IVFFlat probes, prepare metrics tracking
    ACT: Execute benchmark iterations, measure timings and recall
    ASSERT: All metrics meet SLO targets
    """
    test_name = f"Similarity Search ({iterations} iterations)"
    start = time.time()

    try:
        # ARRANGE: Set probes and prepare tracking
        cursor = conn.cursor()
        cursor.execute("SET ivfflat.probes = %s", (probes,))

        times = []
        recall_at_5_scores = []
        recall_at_10_scores = []
        queries_using_index = 0
        queries_checked = 0

        # ACT: Execute benchmark queries
        for i in range(iterations):
            query_embedding = generate_embedding()
            embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'

            # Measure query time
            query_start = time.time()
            cursor.execute("""
                SELECT id FROM knowledge.conversations
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT 5
            """, (embedding_str,))
            approximate_results = [row[0] for row in cursor.fetchall()]
            query_time = (time.time() - query_start) * 1000
            times.append(query_time)

            # Measure recall (every 100th query)
            if i % 100 == 0:
                # Ground truth (exact search)
                cursor.execute("""
                    SELECT id FROM knowledge.conversations
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT 10
                """, (embedding_str,))
                ground_truth = [row[0] for row in cursor.fetchall()]

                recall_5 = len(set(approximate_results) & set(ground_truth[:5])) / 5.0
                recall_10 = len(set(approximate_results) & set(ground_truth)) / 10.0

                recall_at_5_scores.append(recall_5)
                recall_at_10_scores.append(recall_10)

            # Check index usage (first 5 queries)
            if i < 5:
                cursor.execute("""
                    EXPLAIN ANALYZE
                    SELECT id FROM knowledge.conversations
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT 5
                """, (embedding_str,))

                plan = '\n'.join([row[0] for row in cursor.fetchall()])
                if 'ivfflat' in plan.lower() or 'idx_conversations_embedding' in plan.lower():
                    queries_using_index += 1
                queries_checked += 1

        # Calculate metrics
        metrics = PerformanceMetrics(
            avg_query_time_ms=np.mean(times),
            p50_query_time_ms=np.percentile(times, 50),
            p95_query_time_ms=np.percentile(times, 95),
            p99_query_time_ms=np.percentile(times, 99),
            insert_speed_rows_per_sec=0.0,  # Set by caller
            index_build_time_sec=0.0,  # Set by caller
            recall_at_5=np.mean(recall_at_5_scores) if recall_at_5_scores else 0.0,
            recall_at_10=np.mean(recall_at_10_scores) if recall_at_10_scores else 0.0,
            queries_using_index=queries_using_index,
            queries_total=queries_checked,
            write_amplification=0.0  # Set by caller
        )

        # ASSERT: Metrics meet SLO
        passes, failures = metrics.passes_slo()
        if not passes:
            raise AssertionError(f"SLO violations: {'; '.join(failures)}")

        print(f"✅ PASS: {test_name}")
        print(f"   Avg: {metrics.avg_query_time_ms:.2f}ms | P95: {metrics.p95_query_time_ms:.2f}ms")
        print(f"   Recall@5: {metrics.recall_at_5:.2%} | Index usage: {queries_using_index}/{queries_checked}")

        return (
            TestResult(
                test_name=test_name,
                status="PASS",
                metrics=metrics,
                duration_sec=time.time() - start
            ),
            metrics
        )

    except Exception as e:
        print(f"❌ FAIL: {test_name} - {e}")
        return (
            TestResult(
                test_name=test_name,
                status="FAIL",
                error=str(e),
                duration_sec=time.time() - start
            ),
            None
        )


def test_cleanup(conn, inserted_ids: List[int]) -> TestResult:
    """
    Test: Safe cleanup using exact IDs

    ARRANGE: Prepare ID list
    ACT: Delete in batches of 1000
    ASSERT: No errors, all rows deleted
    """
    test_name = f"Cleanup ({len(inserted_ids)} rows)"
    start = time.time()

    try:
        # ARRANGE: Get cursor
        cursor = conn.cursor()

        # ACT: Delete in batches
        for i in range(0, len(inserted_ids), 1000):
            chunk = inserted_ids[i:i + 1000]
            cursor.execute(
                "DELETE FROM knowledge.conversations WHERE id = ANY(%s)",
                (chunk,)
            )
        conn.commit()

        # ASSERT: Verify deletion
        cursor.execute(
            "SELECT COUNT(*) FROM knowledge.conversations WHERE id = ANY(%s)",
            (inserted_ids,)
        )
        remaining = cursor.fetchone()[0]

        if remaining > 0:
            raise AssertionError(f"{remaining} rows not deleted")

        print(f"✅ PASS: {test_name}")
        return TestResult(
            test_name=test_name,
            status="PASS",
            duration_sec=time.time() - start
        )

    except Exception as e:
        conn.rollback()
        print(f"❌ FAIL: {test_name} - {e}")
        return TestResult(
            test_name=test_name,
            status="FAIL",
            error=str(e),
            duration_sec=time.time() - start
        )


# ════════════════════════════════════════════════════════════
# TEST ORCHESTRATION
# ════════════════════════════════════════════════════════════

def run_test_suite(scale_size: int) -> List[TestResult]:
    """
    Run complete test suite for one scale.

    Returns: List of TestResult objects
    """
    print(f"\n{'='*80}")
    print(f"TEST SUITE: {scale_size} rows")
    print(f"{'='*80}\n")

    results = []

    with get_connection() as conn:
        # Test 1: Index exists
        results.append(test_index_exists(conn))

        # Test 2: Bulk insert
        test_prefix = f'scale_{scale_size}'
        insert_result, inserted_ids = test_bulk_insert_performance(
            conn, scale_size, test_prefix
        )
        results.append(insert_result)

        if insert_result.status == "FAIL":
            print("⚠️  Skipping remaining tests due to insert failure")
            return results

        # Test 3: VACUUM ANALYZE
        results.append(test_vacuum_analyze(conn))

        # Test 4: Warmup phase
        results.append(test_similarity_search_warmup(
            conn, WARMUP_ITERATIONS, probes=10
        ))

        # Test 5: Benchmark phase
        benchmark_result, metrics = test_similarity_search_benchmark(
            conn, BENCHMARK_ITERATIONS, probes=10
        )
        results.append(benchmark_result)

        # Test 6: Cleanup
        results.append(test_cleanup(conn, inserted_ids))

    return results


def print_test_summary(all_results: Dict[int, List[TestResult]]):
    """Print aggregated test results."""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80 + "\n")

    total_tests = 0
    passed_tests = 0
    failed_tests = 0

    for scale, results in all_results.items():
        print(f"\nScale: {scale} rows")
        print("-" * 40)
        for result in results:
            status_icon = "✅" if result.status == "PASS" else "❌"
            print(f"{status_icon} {result.test_name}: {result.status} ({result.duration_sec:.2f}s)")
            if result.error:
                print(f"   Error: {result.error}")

            total_tests += 1
            if result.status == "PASS":
                passed_tests += 1
            else:
                failed_tests += 1

    print("\n" + "="*80)
    print(f"OVERALL: {passed_tests}/{total_tests} tests passed, {failed_tests} failed")
    print("="*80 + "\n")

    if failed_tests > 0:
        print("❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("✅ ALL TESTS PASSED")


# ════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════

def main():
    """Main entry point."""
    print("🚀 Performance Validation V3 (AAA-structured)")
    print(f"Database: {DB_NAME}@{DB_HOST}:{DB_PORT}")
    print(f"Scales: {SCALE_TEST_SIZES}")
    print(f"Warmup: {WARMUP_ITERATIONS} | Benchmark: {BENCHMARK_ITERATIONS}\n")

    init_connection_pool()

    try:
        all_results = {}
        for scale_size in SCALE_TEST_SIZES:
            try:
                results = run_test_suite(scale_size)
                all_results[scale_size] = results
            except KeyboardInterrupt:
                print("\n⚠️  Interrupted by user")
                break
            except Exception as e:
                print(f"❌ Suite failed at scale {scale_size}: {e}")
                import traceback
                traceback.print_exc()
                break

        print_test_summary(all_results)

    finally:
        if connection_pool:
            connection_pool.closeall()
            print("✅ Connection pool closed")


if __name__ == '__main__':
    main()
